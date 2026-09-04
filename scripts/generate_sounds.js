const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../assets/sounds');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeWavFile(filename, notes, totalDurationMs, sampleRate = 44100) {
  const totalSamples = Math.floor((totalDurationMs * sampleRate) / 1000);
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Float buffer to mix notes with harmonics & reverb
  const floatSamples = new Float32Array(totalSamples);

  for (const note of notes) {
    const { freq, startMs, durationMs, amp = 0.5 } = note;
    const startSample = Math.floor((startMs * sampleRate) / 1000);
    const noteSamples = Math.floor((durationMs * sampleRate) / 1000);

    for (let i = 0; i < noteSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;

      const t = i / sampleRate;
      const progress = i / noteSamples;

      // ADSR envelope: fast smooth attack (12ms), exponential decay
      const attackSamples = Math.floor((0.012 * sampleRate));
      let envelope = 1.0;
      if (i < attackSamples) {
        envelope = Math.sin((i / attackSamples) * (Math.PI / 2));
      } else {
        envelope = Math.exp(-progress * 4.2);
      }

      // Rich harmonic spectrum (fundamental + soft octaves & fifths + marimba overtone)
      const fundamental = Math.sin(2 * Math.PI * freq * t);
      const overtone1 = Math.sin(4 * Math.PI * freq * t) * 0.35;
      const overtone2 = Math.sin(6 * Math.PI * freq * t) * 0.15;
      const chimeTone = Math.sin(2 * Math.PI * (freq * 2.75) * t) * 0.08;

      const harmonicSample = (fundamental + overtone1 + overtone2 + chimeTone) * envelope * amp;
      floatSamples[idx] += harmonicSample;

      // Subtle soft reverb echo (80ms later, decayed)
      const echoDelay = Math.floor(0.08 * sampleRate);
      if (idx + echoDelay < totalSamples) {
        floatSamples[idx + echoDelay] += harmonicSample * 0.22;
      }
      const echoDelay2 = Math.floor(0.16 * sampleRate);
      if (idx + echoDelay2 < totalSamples) {
        floatSamples[idx + echoDelay2] += harmonicSample * 0.10;
      }
    }
  }

  // Normalize and write 16-bit PCM
  let maxAmp = 0.0;
  for (let i = 0; i < totalSamples; i++) {
    if (Math.abs(floatSamples[i]) > maxAmp) maxAmp = Math.abs(floatSamples[i]);
  }
  const scale = maxAmp > 0.85 ? 0.85 / maxAmp : 0.85;

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const val = Math.max(-32768, Math.min(32767, Math.floor(floatSamples[i] * scale * 32767)));
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }

  fs.writeFileSync(filename, buffer);
  console.log(`Generated ${path.basename(filename)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

// 1. Soothing Melodic Ringtone (Gentle E-Major Marimba / Bell Arpeggio)
// Notes: E5 (659.25), G#5 (830.61), B5 (987.77), E6 (1318.51), B5 (987.77), G#5 (830.61)
const ringtoneNotes = [
  // Phrase 1
  { freq: 659.25, startMs: 0, durationMs: 400, amp: 0.55 },
  { freq: 830.61, startMs: 180, durationMs: 400, amp: 0.58 },
  { freq: 987.77, startMs: 360, durationMs: 420, amp: 0.62 },
  { freq: 1318.51, startMs: 540, durationMs: 650, amp: 0.68 },
  { freq: 987.77, startMs: 780, durationMs: 400, amp: 0.55 },
  { freq: 830.61, startMs: 960, durationMs: 450, amp: 0.50 },

  // Phrase 2 (gentle harmonic variation)
  { freq: 659.25, startMs: 1250, durationMs: 400, amp: 0.55 },
  { freq: 830.61, startMs: 1420, durationMs: 400, amp: 0.58 },
  { freq: 1108.73, startMs: 1600, durationMs: 450, amp: 0.64 }, // C#6
  { freq: 1318.51, startMs: 1800, durationMs: 700, amp: 0.70 }, // E6
];
writeWavFile(path.join(outputDir, 'ringtone.wav'), ringtoneNotes, 2800);

// 2. Call Connected: Warm, welcoming two-tone chime
const connectNotes = [
  { freq: 587.33, startMs: 0, durationMs: 250, amp: 0.55 },  // D5
  { freq: 880.00, startMs: 120, durationMs: 400, amp: 0.65 }, // A5
];
writeWavFile(path.join(outputDir, 'connect.wav'), connectNotes, 650);

// 3. Call Hangup: Gentle descending soft chime
const hangupNotes = [
  { freq: 880.00, startMs: 0, durationMs: 220, amp: 0.55 },  // A5
  { freq: 659.25, startMs: 100, durationMs: 240, amp: 0.50 }, // E5
  { freq: 440.00, startMs: 200, durationMs: 400, amp: 0.45 }, // A4
];
writeWavFile(path.join(outputDir, 'hangup.wav'), hangupNotes, 750);

// 4. Message Droplet: Crisp modern notification sound
const messageNotes = [
  { freq: 1046.50, startMs: 0, durationMs: 150, amp: 0.60 }, // C6
  { freq: 1318.51, startMs: 60, durationMs: 250, amp: 0.70 }, // E6
];
writeWavFile(path.join(outputDir, 'message.wav'), messageNotes, 400);

console.log('All sound files generated successfully!');
