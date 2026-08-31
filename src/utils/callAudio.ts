import { Audio } from 'expo-av';
import { API_BASE_URL } from '../services/api';

class CallAudioManager {
  private currentSound: Audio.Sound | null = null;
  private isAudioModeConfigured = false;

  async setupAudio(isSpeakerOn = true) {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: !isSpeakerOn,
      });
      this.isAudioModeConfigured = true;
    } catch (err) {
      console.warn('[CallAudio] Audio mode setup failed:', err);
    }
  }

  async playRingtone() {
    try {
      await this.stopAudio();
      await this.setupAudio(true);
      const ringtoneUrl = `${API_BASE_URL}/sounds/ringtone`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: ringtoneUrl },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.currentSound = sound;
    } catch (err) {
      console.warn('[CallAudio] Ringtone error:', err);
    }
  }

  async playConnected() {
    try {
      await this.stopAudio();
      await this.setupAudio(true);
      const connectUrl = `${API_BASE_URL}/sounds/connect`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: connectUrl },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      this.currentSound = sound;
    } catch (err) {
      console.warn('[CallAudio] Connect tone error:', err);
    }
  }

  async playHangup() {
    try {
      await this.stopAudio();
      await this.setupAudio(true);
      const hangupUrl = `${API_BASE_URL}/sounds/hangup`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: hangupUrl },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      this.currentSound = sound;
      setTimeout(() => {
        sound.unloadAsync().catch(() => {});
      }, 1200);
    } catch (err) {
      console.warn('[CallAudio] Hangup tone error:', err);
    }
  }

  async setSpeaker(enabled: boolean) {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: !enabled,
      });
    } catch (err) {
      console.warn('[CallAudio] Speaker toggle error:', err);
    }
  }

  async stopAudio() {
    try {
      if (this.currentSound) {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
        this.currentSound = null;
      }
    } catch {
      this.currentSound = null;
    }
  }
}

export const callAudio = new CallAudioManager();
