/**
 * Real voice-note recording via expo-av. Extracted from the legacy
 * chunk-relay engine (voiceStream.ts) — same permission/audio-session setup
 * (including the explicit interruption modes that avoid the record/playback
 * conflict documented there), used here for actual one-shot voice notes
 * instead of a 1-second streaming loop.
 */
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

export async function startVoiceRecording(): Promise<Audio.Recording> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Microphone permission not granted');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 64000,
    },
    ios: {
      extension: '.m4a',
      audioQuality: Audio.IOSAudioQuality.MEDIUM,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 64000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm;codecs=opus',
      bitsPerSecond: 64000,
    },
  });
  await recording.startAsync();
  return recording;
}

/** Stops the recording and returns the local file URI (or null if it never produced one). */
export async function stopVoiceRecording(recording: Audio.Recording): Promise<string | null> {
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {}
  return uri;
}

/** Stops and discards a recording without returning its file — used on cancel. */
export async function discardVoiceRecording(recording: Audio.Recording): Promise<void> {
  try {
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // already stopped/unloaded — nothing to do
  }
}
