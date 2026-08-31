/**
 * LEGACY FALLBACK — superseded by real-time WebRTC calling (webrtcCall.ts).
 *
 * This engine is no longer used by the calling UI (App.tsx now drives calls
 * entirely through webrtcCallEngine / RTCPeerConnection). It's kept only as
 * a documented reference/fallback and is not wired into any screen.
 *
 * It never worked as "real-time" audio: each 1-second slice is recorded to
 * an .m4a file, base64-encoded, sent over Socket.IO, decoded, and played
 * back as a brand-new Sound object — a multi-second round trip per chunk,
 * not a live stream, and the reason two-way audio was silent/broken in the
 * original app: `Audio.setAudioModeAsync` was never given an
 * `interruptionModeIOS`/`interruptionModeAndroid`, so on many devices the
 * OS audio session opened for *recording* silently blocks concurrent
 * *playback* (or vice versa) — the mic would capture fine but the incoming
 * chunk's `Audio.Sound.createAsync(...)` would either throw or play into a
 * muted/interrupted route, which is exactly the "I'm talking but not
 * hearing anything" symptom. The two fixes below (explicit interruption
 * modes that allow simultaneous record+playback, and a short gap between
 * record cycles so the OS actually releases/reacquires the audio session
 * instead of thrashing it every second) address that specific bug, in case
 * this fallback path is ever revived — but the real fix is WebRTC, which
 * uses one continuous OS audio session for the whole call instead of
 * tearing one down and rebuilding it every second.
 */
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { socketService } from '../services/socket';

class LowLatencyVoiceEngine {
  private isStreaming = false;
  private isMuted = false;
  private senderId = '';
  private targetId = '';
  private currentRecording: Audio.Recording | null = null;
  private isLoopRunning = false;

  async startStreaming(senderId: string, targetId: string) {
    if (this.isStreaming && this.isLoopRunning) return;
    this.senderId = senderId;
    this.targetId = targetId;
    this.isStreaming = true;
    this.isMuted = false;

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn('[VoiceStream] Microphone permission not granted');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        // Without an explicit interruption mode, the OS audio session opened
        // for recording can silently block concurrent playback on iOS/Android
        // (or get interrupted itself) — this was the root cause of one-way
        // "I talk but don't hear anything" audio. DoNotMix here means "don't
        // let some other app's audio interrupt this session," not "don't
        // allow record+playback together" — record and playback within our
        // own session are still simultaneous, which is what a call needs.
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      this.runStreamingLoop();
    } catch (err) {
      console.warn('[VoiceStream] Start error:', err);
    }
  }

  private async runStreamingLoop() {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    while (this.isStreaming) {
      let recording: Audio.Recording | null = null;
      try {
        recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 32000,
          },
          ios: {
            extension: '.m4a',
            audioQuality: Audio.IOSAudioQuality.LOW,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 32000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/webm;codecs=opus',
            bitsPerSecond: 32000,
          },
        });

        this.currentRecording = recording;
        await recording.startAsync();

        // Record for 1.0 second slice
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!this.isStreaming) {
          await recording.stopAndUnloadAsync().catch(() => {});
          this.currentRecording = null;
          break;
        }

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        this.currentRecording = null;

        if (uri && !this.isMuted && this.isStreaming) {
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (base64Data && base64Data.length > 100) {
            socketService.sendVoiceChunk(this.targetId, base64Data);
          }

          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }

        // Give the OS audio session a brief moment to actually release
        // before immediately re-preparing a new Recording. Chaining
        // stopAndUnloadAsync() -> prepareToRecordAsync() with zero gap is
        // exactly the kind of rapid session churn that leaves iOS/Android
        // audio routing in a bad state after a few cycles (recording stops
        // capturing, or playback stops being audible, with no error thrown).
        if (this.isStreaming) {
          await new Promise(resolve => setTimeout(resolve, 60));
        }
      } catch (err) {
        console.warn('[VoiceStream] Loop step error:', err);
        if (recording) {
          try {
            await recording.stopAndUnloadAsync();
          } catch {}
          this.currentRecording = null;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    this.isLoopRunning = false;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // Handle incoming voice chunk from peer
  async handleIncomingVoiceChunk(base64Audio: string) {
    if (!base64Audio || !this.isStreaming || this.isMuted) return;

    try {
      const tempPath = `${FileSystem.cacheDirectory}rx_voice_${Date.now()}_${Math.random().toString(36).substring(7)}.m4a`;
      await FileSystem.writeAsStringAsync(tempPath, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempPath },
        { shouldPlay: true, volume: 1.0 }
      );

      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        }
      });
    } catch (err) {
      console.warn('[VoiceStream] Play error:', err);
    }
  }

  async stopStreaming() {
    this.isStreaming = false;
    if (this.currentRecording) {
      try {
        await this.currentRecording.stopAndUnloadAsync();
      } catch {}
      this.currentRecording = null;
    }
  }
}

export const voiceStreamEngine = new LowLatencyVoiceEngine();
