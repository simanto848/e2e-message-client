import { Audio } from 'expo-av';
import { API_BASE_URL } from '../services/api';

const LOCAL_SOUNDS = {
  ringtone: require('../../assets/sounds/ringtone.wav'),
  connect: require('../../assets/sounds/connect.wav'),
  hangup: require('../../assets/sounds/hangup.wav'),
  message: require('../../assets/sounds/message.wav'),
};

class CallAudioManager {
  private currentSound: Audio.Sound | null = null;
  private isPlaying = false;

  async setupAudioForRingtone() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[CallAudio] Ringtone audio mode setup failed:', err);
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
        console.warn('[CallAudio] Local ringtone asset failed, falling back to network:', localErr);
      }

      // Network fallback
      const ringtoneUrl = `${API_BASE_URL}/sounds/ringtone`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: ringtoneUrl },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.currentSound = sound;
    } catch (err) {
      console.warn('[CallAudio] Ringtone playback error:', err);
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
      console.warn('[CallAudio] Connect tone error:', err);
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
        // Fallback to network
        const hangupUrl = `${API_BASE_URL}/sounds/hangup`;
        const { sound } = await Audio.Sound.createAsync(
          { uri: hangupUrl },
          { shouldPlay: true, isLooping: false, volume: 0.9 }
        );
        this.currentSound = sound;
      }
    } catch (err) {
      console.warn('[CallAudio] Hangup tone error:', err);
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
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[CallAudio] Failed to unblock VoIP audio mode:', err);
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[CallAudio] Failed to restore default audio mode:', err);
    }
  }
}

export const callAudio = new CallAudioManager();

