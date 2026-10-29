// Isolated real Web Audio fixture. Never imported by the game entry point.
import { AudioManager } from '../../apps/web/src/game/audio/AudioManager';
import { AMBIENCE, EFFECTS } from '../../apps/web/src/game/audio/catalog';
const manager = new AudioManager();
let analyser: AnalyserNode;
let recorder: MediaRecorder;
let chunks: Blob[] = [];
document.querySelector('#unlock')!.addEventListener('click', () => {
  manager.unlock();
  if (analyser) return;
  const { context, master } = manager as unknown as { context: AudioContext; master: GainNode };
  analyser = context.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser);
  const destination = context.createMediaStreamDestination(); master.connect(destination);
  recorder = new MediaRecorder(destination.stream);
  recorder.ondataavailable = event => chunks.push(event.data);
});
Object.assign(window, { audioPreview: {
  manager,
  rms: () => { const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length); },
  decodeAll: async () => {
    const context = new AudioContext();
    try {
      // Audit short stock assets without decoding full-length installed songs into RAM.
      const stockMusic = ['runner', 'balance', 'stars', 'waiting', 'ending']
        .flatMap(name => ['ogg', 'mp3'].map(format => `/audio/original-v1/music-${name}.${format}`));
      const files = new Set([...stockMusic, ...[...Object.values(AMBIENCE), ...Object.values(EFFECTS)]
        .flatMap(file => file.urls)]);
      const report = [];
      for (const url of files.values()) {
        const response = await fetch(url); if (!response.ok) throw new Error(url);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        let peak = 0, energy = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) for (const sample of buffer.getChannelData(c)) {
          peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
        }
        report.push({ url, seconds: buffer.duration, channels: buffer.numberOfChannels, peak,
          rms: Math.sqrt(energy / (buffer.length * buffer.numberOfChannels)) });
      }
      return report;
    } finally { await context.close(); }
  },
  record: () => { chunks = []; recorder.start(); },
  finishRecording: () => new Promise<string>(resolve => {
    recorder.onstop = async () => {
      const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
      let data = ''; for (const byte of bytes) data += String.fromCharCode(byte);
      resolve(btoa(data));
    };
    recorder.stop();
  }),
} });
