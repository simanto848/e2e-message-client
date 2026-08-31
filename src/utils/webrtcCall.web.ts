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
 * changes. Every method below just fails loudly with a clear message
 * instead of silently hanging, since real voice/video calling genuinely
 * isn't available in a browser build of this app.
 */

export interface CallEngineHandlers {
  onRemoteStream: (stream: any) => void;
  onConnectionStateChange?: (state: string) => void;
}

const UNSUPPORTED_MESSAGE = 'Calling is not available in the web preview — use the Android or iOS app.';

class UnsupportedWebRTCCallEngine {
  async startLocalMedia(_video: boolean): Promise<any> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async startCall(
    _myUserId: string,
    _peerId: string,
    _callId: string,
    _video: boolean,
    _handlers: CallEngineHandlers
  ): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async acceptCall(
    _myUserId: string,
    _peerId: string,
    _callId: string,
    _video: boolean,
    _remoteOfferSdp: any,
    _handlers: CallEngineHandlers
  ): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async handleRemoteAnswer(_sdp: any): Promise<void> {}
  async handleRemoteIceCandidate(_candidate: any): Promise<void> {}

  setMuted(_muted: boolean): void {}
  setVideoEnabled(_enabled: boolean): void {}
  getLocalStream(): any {
    return null;
  }

  endCall(): void {}
  cleanup(): void {}
}

export const webrtcCallEngine = new UnsupportedWebRTCCallEngine();
