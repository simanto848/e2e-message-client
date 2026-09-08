/**
 * Web build stub for the WebRTC calling engine.
 *
 * react-native-webrtc is a native-module-only package with no web
 * implementation. Its view components (RTCView) call
 * requireNativeComponent(...) at module-LOAD time — not when you actually
 * use them — so merely importing anything from 'react-native-webrtc' is
 * enough to crash a web bundle immediately with:
 *   "requireNativeComponent is not a function"
 * because react-native-web has no such API. That crash is what sent you
 * here: expo start --web (or pressing "w" in the Expo CLI) bundles for the
 * "web" platform, and the real webrtcCall.ts pulls in react-native-webrtc
 * at the top of the file.
 *
 * This file exists so that never happens: Metro's platform-extension
 * convention (the `.web.ts` suffix) makes it pick THIS file instead of
 * webrtcCall.ts whenever it bundles for web, and native builds (Android/iOS,
 * where App.tsx has no `.ios`/`.android` suffix to prefer) fall through to
 * the real webrtcCall.ts untouched — nothing about the native calling path
 * changes.
 *
 * Interface parity with webrtcCall.ts is intentional: App.tsx / useWebRTCCall
 * call restartIce / handleRestartOffer / handleRestartAnswer /
 * getConnectionState / logMediaDiagnostics / setSpeakerEnabled / switchCamera
 * unconditionally. Every method here exists so the web bundle never crashes
 * with "X is not a function" — unsupported paths warn + no-op (or throw for
 * media acquisition), guarded by isSupported() === false.
 */

export interface CallEngineHandlers {
  onRemoteStream: (stream: any) => void;
  onConnectionStateChange?: (state: string) => void;
}

const UNSUPPORTED_MESSAGE = 'Calling is not available in the web preview \u2014 use the Android or iOS app.';

function warn(method: string): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[webrtcCall.web] ${method}() is not supported on web — no-op.`);
  }
}

class UnsupportedWebRTCCallEngine {
  /** Always false on web — gate all call UI behind this (see useWebRTCCall). */
  isSupported(): boolean {
    return false;
  }

  async startLocalMedia(_video: boolean): Promise<any> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async startCall(
    _myUserId: string,
    _peerId: string,
    _callId: string,
    _video: boolean,
    _handlers: CallEngineHandlers,
    _isSpeakerOn?: boolean
  ): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async acceptCall(
    _myUserId: string,
    _peerId: string,
    _callId: string,
    _video: boolean,
    _remoteOfferSdp: any,
    _handlers: CallEngineHandlers,
    _isSpeakerOn?: boolean
  ): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async handleRemoteAnswer(_sdp: any, _isSpeakerOn?: boolean): Promise<void> {
    warn('handleRemoteAnswer');
  }

  async handleRemoteIceCandidate(_candidate: any): Promise<void> {
    warn('handleRemoteIceCandidate');
  }

  /** Current aggregated connection state — always 'none' on web (no PC). */
  getConnectionState(): string {
    return 'none';
  }

  /** No-op diagnostics stub (mirrors native logMediaDiagnostics). */
  logMediaDiagnostics(_tag = 'WebRTC'): void {
    warn('logMediaDiagnostics');
  }

  /** ICE restart is a no-op on web — there is no peer connection. */
  async restartIce(): Promise<void> {
    warn('restartIce');
  }

  /** Peer-side ICE-restart renegotiation — no-op on web. */
  async handleRestartOffer(_sdp: any): Promise<void> {
    warn('handleRestartOffer');
  }

  /** Restart-answer application — no-op on web. */
  async handleRestartAnswer(_sdp: any): Promise<void> {
    warn('handleRestartAnswer');
  }

  /** One-line mic health stub — no local stream on web. */
  getLocalAudioHealth(): string {
    return 'muted=? tracks=? (web unsupported)';
  }

  setSpeakerEnabled(_enabled: boolean): void {
    warn('setSpeakerEnabled');
  }

  setMuted(_muted: boolean): void {
    warn('setMuted');
  }

  setVideoEnabled(_enabled: boolean): void {
    warn('setVideoEnabled');
  }

  switchCamera(): void {
    warn('switchCamera');
  }

  getLocalStream(): any {
    return null;
  }

  endCall(_callType?: 'audio' | 'video'): void {
    warn('endCall');
  }

  rejectIncoming(_myUserId: string, _peerId: string, _callId: string, _callType?: 'audio' | 'video'): void {
    warn('rejectIncoming');
  }

  cleanup(): void {
    warn('cleanup');
  }
}

export const webrtcCallEngine = new UnsupportedWebRTCCallEngine();
