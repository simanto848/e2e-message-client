/**
 * Real-time calling via WebRTC — replaces the old chunk-relay approach in
 * voiceStream.ts (record a 1s file, base64-encode it, bounce it through the
 * app server over Socket.IO, decode, play a new Sound object; repeat).
 *
 * That approach had a hard latency floor well over a second per hop and
 * transmitted call audio as cleartext through the server. This module
 * instead establishes a real RTCPeerConnection directly between the two
 * callers (or via a TURN relay when a direct path isn't possible), streaming
 * audio/video continuously over SRTP (encrypted, low-latency, jitter-buffered,
 * with the Opus codec) — the same transport every real calling app uses.
 * Typical mouth-to-ear latency on a direct connection is ~100-300ms.
 *
 * REQUIRES A NATIVE REBUILD: react-native-webrtc ships native code and will
 * NOT run inside Expo Go. Run `npx expo prebuild` (or build a custom Expo
 * Dev Client via EAS) before this can be tested on a device. See
 * JABY_CALLING_FIX_PLAN.md for the full setup, including why you also need a
 * STUN/TURN server for real-world network conditions.
 *
 * The app server (server/src/sockets/chatSocket.ts, `call_signal` event)
 * only relays SDP offers/answers and ICE candidates — it never sees the
 * audio/video itself. That's a real architectural improvement: it's not
 * possible to eavesdrop on calls from the server anymore, whereas the old
 * `call_voice_chunk` relay put raw audio through it.
 */
import {
  isWebRTCSupported,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  InCallManager,
  MediaStream,
  RNMediaStream,
} from './webrtcAdapter';
import { socketService } from '../services/socket';
import { callAudio } from './callAudio';
import { getIceServers } from '../services/config';

export interface CallEngineHandlers {
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: string) => void;
}

class WebRTCCallEngine {
  private pc: any = null;
  private localStream: MediaStream | null = null;
  private myUserId: string | null = null;
  private peerId: string | null = null;
  private callId: string | null = null;
  // ICE candidates routinely arrive from the peer before setRemoteDescription
  // has run (e.g. while the callee is still ringing, before they've tapped
  // Accept and created their own RTCPeerConnection). addIceCandidate isn't
  // safe to call yet at that point, so anything that arrives early is queued
  // here and flushed once the remote description is set — otherwise those
  // candidates are just lost and ICE can fail to find any usable pair,
  // leaving the call showing "Connected" with no audio ever flowing.
  private pendingIceCandidates: any[] = [];
  private remoteDescriptionSet = false;
  private isVideo = false;

  /** Check if native WebRTC module is linked and ready */
  isSupported(): boolean {
    return isWebRTCSupported && Boolean(RTCPeerConnection && mediaDevices);
  }

  /** Request the mic (and camera, for video calls) and start local capture. */
  async startLocalMedia(video: boolean): Promise<MediaStream> {
    if (!this.isSupported() || !mediaDevices) {
      throw new Error(
        'WebRTC native module is not available in standard Expo Go.\n\nTo enable peer-to-peer calling, run the development client build with "npx expo run:android" or "npx expo run:ios".'
      );
    }
    // Ensure expo-av doesn't hold audio session in non-recording or ducked mode
    await callAudio.restoreDefaultAudioMode().catch(() => {});

    let stream: any = null;
    try {
      // react-native-webrtc canonical audio constraint
      stream = await mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user' } : false,
      });
    } catch (err) {
      console.warn('[WebRTC] getUserMedia audio:true fallback to explicit constraints:', err);
      stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video ? { facingMode: 'user' } : false,
      });
    }

    // Explicitly ensure all captured local tracks are enabled and unmuted
    if (stream) {
      stream.getTracks().forEach((track: any) => {
        track.enabled = true;
      });
    }

    this.localStream = stream as unknown as MediaStream;
    return this.localStream;
  }

  private createPeerConnection(myUserId: string, peerId: string, callId: string, callType: 'audio' | 'video', handlers: CallEngineHandlers): any {
    if (!this.isSupported() || !RTCPeerConnection) {
      throw new Error('WebRTC native module is not available in standard Expo Go.');
    }
    // Defensive: a stale peer connection from a previous call that was never
    // torn down (a double-tap on "Call", or a caller re-entering startCall
    // before the last one settled) would otherwise leak — its mic stays hot
    // and it keeps sending ICE candidates under the old callId, fighting the
    // new connection. Close it before building the new one.
    if (this.pc) {
      try {
        this.pc.close();
      } catch (err) {
        console.warn('[WebRTC] Failed to close stale peer connection:', err);
      }
      this.pc = null;
    }
    this.myUserId = myUserId;
    this.peerId = peerId;
    this.callId = callId;
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;

    // react-native-webrtc's RTCPeerConnection mirrors the browser API.
    // ICE servers come from config so a working TURN relay can be supplied
    // via EXPO_PUBLIC_TURN_* without touching this file (see config.ts —
    // without TURN, NAT'd pairs like emulator<->phone cannot connect at all).
    const pc = new RTCPeerConnection({ iceServers: getIceServers() as any });

    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        socketService.sendCallSignal({
          callId,
          senderId: myUserId,
          targetId: peerId,
          type: callType,
          signalType: 'ice-candidate',
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    });

    // Handle modern track events
    pc.addEventListener('track', (event: any) => {
      let stream = event.streams && event.streams[0];
      if (!stream && event.track && RNMediaStream) {
        try {
          stream = new RNMediaStream([event.track]);
        } catch (err) {
          console.warn('[WebRTC] Failed to create stream from track fallback:', err);
        }
      }
      if (stream) {
        // Explicitly enable all remote audio/video tracks
        if (event.track) {
          event.track.enabled = true;
        }
        stream.getTracks().forEach((t: any) => {
          t.enabled = true;
        });
        console.log(
          `[WebRTC] Remote ${event.track?.kind || 'stream'} received (muted=${event.track?.muted}, state=${event.track?.readyState})`
        );
        handlers.onRemoteStream(stream);
      }
    });

    // Register legacy addstream event in case native webrtc emits it
    pc.addEventListener('addstream', (event: any) => {
      if (event.stream) {
        event.stream.getTracks().forEach((t: any) => {
          t.enabled = true;
        });
        handlers.onRemoteStream(event.stream);
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      handlers.onConnectionStateChange?.((pc as any).connectionState);
    });

    // Some react-native-webrtc builds surface ICE state transitions more
    // reliably than the aggregated connection state — forward both so the
    // watchdog/restart logic in the hook sees every transition.
    pc.addEventListener('iceconnectionstatechange', () => {
      const iceState = (pc as any).iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        handlers.onConnectionStateChange?.('connected');
      } else if (iceState === 'disconnected') {
        handlers.onConnectionStateChange?.('disconnected');
      } else if (iceState === 'failed') {
        handlers.onConnectionStateChange?.('failed');
      }
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => pc.addTrack(track, this.localStream!));
    }

    this.pc = pc;
    return pc;
  }

  /** Caller side: capture media, create+send an SDP offer. */
  async startCall(
    myUserId: string,
    peerId: string,
    callId: string,
    video: boolean,
    handlers: CallEngineHandlers,
    isSpeakerOn = true
  ): Promise<void> {
    this.isVideo = video;
    await this.startLocalMedia(video);
    // Audio routing is deferred to handleRemoteAnswer so it doesn't collide with ringtone audio mode
    const pc = this.createPeerConnection(myUserId, peerId, callId, video ? 'video' : 'audio', handlers);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: video,
    });
    await pc.setLocalDescription(offer);

    socketService.sendCallSignal({
      callId,
      senderId: myUserId,
      targetId: peerId,
      type: video ? 'video' : 'audio',
      signalType: 'offer',
      sdp: offer,
    });
  }

  /** Callee side: capture media, accept the remote offer, create+send an SDP answer. */
  async acceptCall(
    myUserId: string,
    peerId: string,
    callId: string,
    video: boolean,
    remoteOfferSdp: any,
    handlers: CallEngineHandlers,
    isSpeakerOn = true
  ): Promise<void> {
    this.isVideo = video;
    await this.startLocalMedia(video);
    this.startAudioRouting(video, isSpeakerOn);
    const pc = this.createPeerConnection(myUserId, peerId, callId, video ? 'video' : 'audio', handlers);
    await pc.setRemoteDescription(new RTCSessionDescription(remoteOfferSdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
    const answer = await pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: video,
    });
    await pc.setLocalDescription(answer);

    socketService.sendCallSignal({
      callId,
      senderId: myUserId,
      targetId: peerId,
      type: video ? 'video' : 'audio',
      signalType: 'answer',
      sdp: answer,
    });

    // Re-enforce speakerphone and audio route after native connection settles
    setTimeout(() => {
      this.setSpeakerEnabled(isSpeakerOn);
    }, 300);
  }

  /** Caller side: apply the callee's SDP answer once it arrives. */
  async handleRemoteAnswer(sdp: any, isSpeakerOn = true): Promise<void> {
    if (!this.pc) return;
    const isVideo = Boolean(this.localStream?.getVideoTracks().length);
    this.startAudioRouting(isVideo, isSpeakerOn);
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();

    // Re-enforce speakerphone and audio route after connection settles
    setTimeout(() => {
      this.setSpeakerEnabled(isSpeakerOn);
    }, 300);
  }

  /**
   * Both sides: feed in ICE candidates as they arrive from the peer. These
   * can arrive well before our own RTCPeerConnection exists (e.g. the
   * offer's ICE candidates trickle in while the callee is still ringing),
   * and addIceCandidate isn't safe until setRemoteDescription has run — so
   * anything that arrives early is queued and flushed from acceptCall /
   * handleRemoteAnswer instead of being dropped.
   */
  async handleRemoteIceCandidate(candidate: any): Promise<void> {
    if (!candidate) return;
    if (!this.pc || !this.remoteDescriptionSet) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.pc) return;
    const queued = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Failed to add queued ICE candidate:', err);
      }
    }
  }

  /** Current aggregated connection state ('new'|'connecting'|'connected'|'disconnected'|'failed'|'closed'|'none'). */
  getConnectionState(): string {
    try {
      return (this.pc as any)?.connectionState || 'none';
    } catch {
      return 'none';
    }
  }

  /** One-line media health snapshot for logcat when debugging silent calls. */
  logMediaDiagnostics(tag = '[WebRTC]'): void {
    try {
      const describe = (tracks: any[], label: string) =>
        tracks.map((t: any) => `${label}:{kind=${t.kind},enabled=${t.enabled},muted=${t.muted},state=${t.readyState}}`).join(' ');
      const local = this.localStream ? describe((this.localStream as any).getTracks(), 'local') : 'local:<none>';
      console.log(`${tag} pc=${this.getConnectionState()} ${local}`);
    } catch (err) {
      console.warn(`${tag} diagnostics failed:`, err);
    }
  }

  /**
   * ICE restart for a live call whose path died mid-call (NAT rebinding,
   * Wi-Fi→mobile handover). Re-negotiates with fresh candidates under the
   * SAME callId — the peer handles 'restart-offer' as a renegotiation, not a
   * new call, so nobody re-rings.
   */
  async restartIce(): Promise<void> {
    if (!this.pc || !this.callId || !this.peerId || !this.myUserId) {
      throw new Error('No active peer connection to restart');
    }
    const offer = await this.pc.createOffer({
      iceRestart: true,
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.isVideo,
    });
    await this.pc.setLocalDescription(offer);
    socketService.sendCallSignal({
      callId: this.callId,
      senderId: this.myUserId,
      targetId: this.peerId,
      type: this.isVideo ? 'video' : 'audio',
      signalType: 'restart-offer',
      sdp: offer,
    });
  }

  /** Peer side of an ICE restart: apply, answer, keep the call up. */
  async handleRestartOffer(sdp: any): Promise<void> {
    if (!this.pc || !this.callId || !this.peerId || !this.myUserId) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
    const answer = await this.pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.isVideo,
    });
    await this.pc.setLocalDescription(answer);
    socketService.sendCallSignal({
      callId: this.callId,
      senderId: this.myUserId,
      targetId: this.peerId,
      type: this.isVideo ? 'video' : 'audio',
      signalType: 'restart-answer',
      sdp: answer,
    });
  }

  /** Restarting side: apply the peer's restart answer. */
  async handleRestartAnswer(sdp: any): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
  }

  /**
   * Puts the OS audio session into "in call" mode so react-native-webrtc's
   * remote audio track actually routes somewhere audible.
   */
  private startAudioRouting(video: boolean, isSpeakerOn = true): void {
    try {
      InCallManager?.start({ media: video ? 'video' : 'audio', auto: false });
      InCallManager?.setKeepScreenOn(true);
      this.setSpeakerEnabled(isSpeakerOn);
      // Native audio sessions (Android AudioManager / iOS AVAudioSession)
      // take 100-500ms to complete mode transition after start().
      // Staggered retries ensure speaker state sticks and doesn't get silenced.
      setTimeout(() => this.setSpeakerEnabled(isSpeakerOn), 250);
      setTimeout(() => this.setSpeakerEnabled(isSpeakerOn), 800);
      setTimeout(() => this.setSpeakerEnabled(isSpeakerOn), 1500);
    } catch (err) {
      console.warn('[WebRTC] InCallManager.start failed:', err);
    }
  }

  setSpeakerEnabled(enabled: boolean): void {
    try {
      // setSpeakerphoneOn sets android AudioManager.MODE_IN_COMMUNICATION and speakerphone
      InCallManager?.setSpeakerphoneOn(enabled);
      InCallManager?.setForceSpeakerphoneOn(enabled);
      if (typeof InCallManager?.chooseAudioRoute === 'function') {
        InCallManager.chooseAudioRoute(enabled ? 'SPEAKER_PHONE' : 'EARPIECE');
      }
    } catch (err) {
      console.warn('[WebRTC] InCallManager speaker toggle failed:', err);
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = !muted;
    });
    try {
      InCallManager?.setMicrophoneMute(muted);
    } catch (err) {
      console.warn('[WebRTC] InCallManager.setMicrophoneMute failed:', err);
    }
  }

  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((track: any) => {
      track.enabled = enabled;
    });
  }

  switchCamera(): void {
    const videoTrack = this.localStream?.getVideoTracks()[0] as any;
    if (videoTrack && typeof videoTrack._switchCamera === 'function') {
      try {
        videoTrack._switchCamera();
      } catch (err) {
        console.warn('[WebRTC] switchCamera failed:', err);
      }
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** End the call: notify the peer, then tear everything down locally. */
  endCall(callType?: 'audio' | 'video'): void {
    const finalType = callType || (this.isVideo ? 'video' : 'audio');
    if (this.myUserId && this.peerId && this.callId) {
      socketService.sendCallSignal({
        callId: this.callId,
        senderId: this.myUserId,
        targetId: this.peerId,
        type: finalType,
        signalType: 'hangup',
      });
    }
    this.cleanup();
  }

  /**
   * Decline an incoming call before it's ever been accepted — i.e. before
   * startLocalMedia/createPeerConnection have run, so myUserId/peerId/callId
   * (set only inside createPeerConnection) are still null and endCall()'s
   * signal wouldn't fire. Without this, tapping "Decline" silently cleared
   * the local ringing UI while the caller's phone kept ringing forever,
   * since no signal was ever sent back to them.
   */
  rejectIncoming(myUserId: string, peerId: string, callId: string, callType: 'audio' | 'video' = 'audio'): void {
    socketService.sendCallSignal({
      callId,
      senderId: myUserId,
      targetId: peerId,
      type: callType,
      signalType: 'reject',
    });
    this.cleanup();
  }

  /** Local teardown only (e.g. when the peer hung up), no signal sent. */
  cleanup(): void {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track: any) => track.stop());
    this.localStream = null;
    this.myUserId = null;
    this.peerId = null;
    this.callId = null;
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;
    try {
      InCallManager?.setKeepScreenOn(false);
      InCallManager?.stop();
    } catch (err) {
      console.warn('[WebRTC] InCallManager.stop failed:', err);
    }
    callAudio.restoreDefaultAudioMode().catch(() => {});
  }
}

export const webrtcCallEngine = new WebRTCCallEngine();
