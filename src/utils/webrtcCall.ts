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
  MediaStream,
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
    this.myUserId = myUserId;
    this.peerId = peerId;
    this.callId = callId;

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
      const stream = event.streams && event.streams[0];
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
  async startCall(myUserId: string, peerId: string, callId: string, video: boolean, handlers: CallEngineHandlers): Promise<void> {
    await this.startLocalMedia(video);
    const pc = this.createPeerConnection(myUserId, peerId, callId, video ? 'video' : 'audio', handlers);
    const offer = await pc.createOffer({});
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
  async acceptCall(myUserId: string, peerId: string, callId: string, video: boolean, remoteOfferSdp: any, handlers: CallEngineHandlers): Promise<void> {
    await this.startLocalMedia(video);
    const pc = this.createPeerConnection(myUserId, peerId, callId, video ? 'video' : 'audio', handlers);
    await pc.setRemoteDescription(new RTCSessionDescription(remoteOfferSdp));
    const answer = await pc.createAnswer();
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
  }

  /** Both sides: feed in ICE candidates as they arrive from the peer. */
  async handleRemoteIceCandidate(candidate: any): Promise<void> {
    if (!this.pc || !candidate) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = !muted;
    });
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

  /** Local teardown only (e.g. when the peer hung up), no signal sent. */
  cleanup(): void {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track: any) => track.stop());
    this.localStream = null;
    this.myUserId = null;
    this.peerId = null;
    this.callId = null;
  }
}

export const webrtcCallEngine = new WebRTCCallEngine();
