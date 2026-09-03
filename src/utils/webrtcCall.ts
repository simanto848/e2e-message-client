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

// Public STUN servers get you a direct connection when both devices are on
// reasonably open networks. In practice, a meaningful fraction of real-world
// connections (carrier-grade NAT, symmetric NATs, restrictive Wi-Fi) need a
// TURN relay to connect at all. The turn: entries below are OpenRelay's free,
// publicly-documented community credentials (no signup) — fine for personal
// use with friends, but a best-effort service with no uptime guarantee, not
// a production SLA. Swap in your own (self-hosted coturn or a managed
// provider) before relying on this at any real scale.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

interface RTCIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

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
    const stream = (await mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: 'user' } : false,
    })) as unknown as MediaStream;
    this.localStream = stream;
    return stream;
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS as any });

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

    pc.addEventListener('track', (event: any) => {
      let stream = event.streams && event.streams[0];
      if (!stream && event.track && RNMediaStream) {
        try {
          stream = new RNMediaStream([event.track]);
        } catch (err) {
          console.warn('[WebRTC] Failed to create stream from track fallback:', err);
        }
      }
      if (stream) handlers.onRemoteStream(stream);
    });

    pc.addEventListener('connectionstatechange', () => {
      handlers.onConnectionStateChange?.((pc as any).connectionState);
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
    await this.startLocalMedia(video);
    this.startAudioRouting(video, isSpeakerOn);
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
  }

  /** Caller side: apply the callee's SDP answer once it arrives. */
  async handleRemoteAnswer(sdp: any): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
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

  /**
   * Puts the OS audio session into "in call" mode so react-native-webrtc's
   * remote audio track actually routes somewhere audible.
   */
  private startAudioRouting(video: boolean, isSpeakerOn = true): void {
    try {
      InCallManager?.start({ media: video ? 'video' : 'audio', auto: false });
      InCallManager?.setKeepScreenOn(true);
      this.setSpeakerEnabled(isSpeakerOn);
    } catch (err) {
      console.warn('[WebRTC] InCallManager.start failed:', err);
    }
  }

  setSpeakerEnabled(enabled: boolean): void {
    try {
      InCallManager?.setForceSpeakerphoneOn(enabled);
      if (typeof InCallManager?.chooseAudioRoute === 'function') {
        InCallManager.chooseAudioRoute(enabled ? 'SPEAKER_PHONE' : 'EARPIECE');
      }
    } catch (err) {
      console.warn('[WebRTC] InCallManager.setForceSpeakerphoneOn failed:', err);
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

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** End the call: notify the peer, then tear everything down locally. */
  endCall(): void {
    if (this.myUserId && this.peerId && this.callId) {
      socketService.sendCallSignal({
        callId: this.callId,
        senderId: this.myUserId,
        targetId: this.peerId,
        type: 'audio',
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
  }
}

export const webrtcCallEngine = new WebRTCCallEngine();
