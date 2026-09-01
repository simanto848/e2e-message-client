import { NativeModules, Platform } from 'react-native';

/**
 * Safe adapter for react-native-webrtc.
 *
 * react-native-webrtc requires native C++/Java/Obj-C code that is only available
 * when running a custom development client (expo run:android / expo run:ios) or a production native build.
 * In standard Expo Go or Web, NativeModules.WebRTCModule is undefined/null, which causes react-native-webrtc
 * to throw an unhandled fatal error at module load time.
 *
 * This adapter detects if the native module is actually linked and present before requiring react-native-webrtc,
 * allowing the entire messenger app to run seamlessly without crashing.
 */

export const isWebRTCSupported: boolean =
  Platform.OS !== 'web' &&
  Boolean(NativeModules && NativeModules.WebRTCModule != null);

let WebRTC: any = null;

if (isWebRTCSupported) {
  try {
    WebRTC = require('react-native-webrtc');
  } catch (error) {
    console.warn('[WebRTC] Native module was present in NativeModules, but require("react-native-webrtc") failed:', error);
    WebRTC = null;
  }
}

export const RTCPeerConnection = WebRTC?.RTCPeerConnection ?? null;
export const RTCIceCandidate = WebRTC?.RTCIceCandidate ?? null;
export const RTCSessionDescription = WebRTC?.RTCSessionDescription ?? null;
export const mediaDevices = WebRTC?.mediaDevices ?? null;
export const RTCView = WebRTC?.RTCView ?? null;
export type MediaStream = any;

/**
 * react-native-webrtc streams remote audio through its own native audio
 * pipeline (Android's WebRTC AudioDeviceModule / iOS's AVAudioSession) —
 * it does NOT go through expo-av, and nothing configures it automatically.
 * Without explicitly starting a call audio session (InCallManager), the
 * platform's default audio routing is inconsistent — commonly resulting in
 * "the call connects but neither side hears anything." InCallManager is the
 * standard fix: it puts the OS audio session into call mode and manages
 * speaker/earpiece routing. Guarded the same way as the WebRTC module itself
 * since it's also native code, unavailable in Expo Go/web.
 */
let InCallManagerModule: any = null;
if (isWebRTCSupported) {
  try {
    InCallManagerModule = require('react-native-incall-manager').default;
  } catch (error) {
    console.warn('[WebRTC] react-native-incall-manager was expected but failed to load:', error);
    InCallManagerModule = null;
  }
}
export const InCallManager = InCallManagerModule;
