import { Audio } from 'expo-av';
import { API_BASE_URL } from '../services/api';
import { logger } from './logger';

const LOCAL_SOUNDS = {
  ringtone: require('../../assets/sounds/ringtone.wav'),
  connect: require('../../assets/sounds/connect.wav'),
  hangup: require('../../assets/sounds/hangup.wav'),
  message: require('../../assets/sounds/message.wav'),
};

// Network sound fallback is best-effort only: local assets are the source of
// truth (instant, offline). Remote fetch is bounded so a dead network can
// never hang call setup — it times out and the call proceeds silently.
const NETWORK_SOUND_TIMEOUT_MS = 8000;

function withSoundTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sound fetch timed out')), NETWORK_SOUND_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

class CallAudioManager {
  private currentSound: Audio.Sound | null = null;
  private isPlaying = false;
  /**
   * While a WebRTC call is active the engine (InCallManager) owns the OS
   * audio session. expo-av must not touch AudioManager mode mid-call or it
   * knocks the session out of MODE_IN_COMMUNICATION — the classic "quiet
   * mic in earpiece, fine on speaker" failure. Sound stop/unload still runs;
   * only the mode switch is skipped.
   */
  private inCallMode = false;

  setInCallMode(inCall: boolean): void {
    this.inCallMode = inCall;
  }

  async setupAudioForRingtone() {
    try {
      if (!this.inCallMode) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      }
    } catch (err) {
      logger.warn('CallAudio', 'Ringtone audio mode setup failed:', err);
    }
  }

  async playRingtone() {
    try {
      await this.stopAudio();
      await this.setupAudioForRingtone();
      this.isPlaying = true;

      // Try local sound asset first (instant, 0ms latency, works offline)
      try {
        const { sound } = await Audio.Sound.createAsync(
          LOCAL_SOUNDS.ringtone,
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        this.currentSound = sound;
        return;
      } catch (localErr) {
        logger.warn('CallAudio', 'Local ringtone asset failed, falling back to network:', localErr);
      }

      // Network fallback (bounded — never blocks call setup)
      try {
        const ringtoneUrl = `${API_BASE_URL}/sounds/ringtone`;
        const { sound } = await withSoundTimeout(
          Audio.Sound.createAsync({ uri: ringtoneUrl }, { shouldPlay: true, isLooping: true, volume: 1.0 })
        );
        this.currentSound = sound;
      } catch (netErr) {
        logger.warn('CallAudio', 'Network ringtone fallback failed/timed out:', netErr);
      }
    } catch (err) {
      logger.warn('CallAudio', 'Ringtone playback error:', err);
    }
  }

  async playConnected() {
    try {
      await this.stopAudio();
      try {
        const { sound } = await Audio.Sound.createAsync(
          LOCAL_SOUNDS.connect,
          { shouldPlay: true, isLooping: false, volume: 0.85 }
        );
        this.currentSound = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (this.currentSound === sound) {
              this.currentSound = null;
            }
          }
        });
      } catch {
        // Soft fallback
      }
    } catch (err) {
      logger.warn('CallAudio', 'Connect tone error:', err);
    }
  }

  async playHangup() {
    try {
      await this.stopAudio();
      await this.setupAudioForRingtone();

      try {
        const { sound } = await Audio.Sound.createAsync(
          LOCAL_SOUNDS.hangup,
          { shouldPlay: true, isLooping: false, volume: 0.9 }
        );
        this.currentSound = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (this.currentSound === sound) {
              this.currentSound = null;
            }
          }
        });
      } catch (localErr) {
        // Fallback to network (bounded — best-effort only)
        try {
          const hangupUrl = `${API_BASE_URL}/sounds/hangup`;
          const { sound } = await withSoundTimeout(
            Audio.Sound.createAsync({ uri: hangupUrl }, { shouldPlay: true, isLooping: false, volume: 0.9 })
          );
          this.currentSound = sound;
        } catch (netErr) {
          logger.warn('CallAudio', 'Network hangup fallback failed/timed out:', netErr);
        }
      }
    } catch (err) {
      logger.warn('CallAudio', 'Hangup tone error:', err);
    }
  }

  async playMessageSound() {
    try {
      // Short subtle notification chime, do not interrupt active calls
      if (this.isPlaying) return;
      const { sound } = await Audio.Sound.createAsync(
        LOCAL_SOUNDS.message,
        { shouldPlay: true, isLooping: false, volume: 0.75 }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (err) {
      // Quiet fail for message sound
    }
  }

  /**
   * Release expo-av audio session completely and unblock the microphone so
   * WebRTC and InCallManager can stream bidirectional audio without being muted.
   */
  async releaseAudioSession() {
    await this.stopAudio();
  }

  async stopAudio() {
    this.isPlaying = false;
    try {
      if (this.currentSound) {
        const sound = this.currentSound;
        this.currentSound = null;
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
      }
    } catch {
      this.currentSound = null;
    }

    // CRITICAL: Unblock microphone for iOS and Android WebRTC VoIP streams!
    // Skipped mid-call — the engine owns the session (see inCallMode).
    try {
      if (!this.inCallMode) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      }
    } catch (err) {
      logger.warn('CallAudio', 'Failed to unblock VoIP audio mode:', err);
    }
  }

  async restoreDefaultAudioMode() {
    this.isPlaying = false;
    try {
      if (this.currentSound) {
        const sound = this.currentSound;
        this.currentSound = null;
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
      }
    } catch {
      this.currentSound = null;
    }

    try {
      if (!this.inCallMode) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      }
    } catch (err) {
      logger.warn('CallAudio', 'Failed to restore default audio mode:', err);
    }
  }
}

export const callAudio = new CallAudioManager();

