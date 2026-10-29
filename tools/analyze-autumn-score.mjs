// Signal analysis only: these peaks do not certify verse/chorus identity or listening approval.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const file = 'apps/web/public/audio/user-instrumentals/03-92.mp3';
const sampleRate = 2000;
const decode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file,
  '-af', 'lowpass=f=180', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], { maxBuffer: 8 * 1024 * 1024 });
if (decode.error || decode.status !== 0) throw decode.error ?? new Error(decode.stderr.toString());
const samples = new Float32Array(decode.stdout.buffer, decode.stdout.byteOffset, decode.stdout.length / 4);
const envelope = [];
for (let at = 38; at < 46; at += .01) {
  const start = Math.round(at * sampleRate), end = start + sampleRate * .05;
  let energy = 0; for (let i = start; i < end; i++) energy += samples[i] ** 2;
  envelope.push({ seconds: +at.toFixed(2), rms: Math.sqrt(energy / (end - start)) });
}
const local = envelope.filter((p, i) => i > 0 && i < envelope.length - 1 && p.rms > envelope[i - 1].rms && p.rms > envelope[i + 1].rms);
const separated = [];
for (const peak of local.sort((a, b) => b.rms - a.rms)) if (separated.every(p => Math.abs(p.seconds - peak.seconds) > .65)) separated.push(peak);
const report = { file, sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
  decodedSeconds: samples.length / sampleRate, method: 'mono, 180 Hz low-pass, 50 ms RMS, 10 ms hop',
  peaks: separated.sort((a, b) => a.seconds - b.seconds), selectedMarkers: [39.61, 41.06, 42.52],
  listeningVerified: false, sectionLabelsVerified: false,
  candidateSections: { firstPart: 3, refrain: 25, nextVerse: 49 },
  note: 'Section candidates inferred from energy changes, not established by listening. Calibrate AUTUMN_SCORE after listening.' };
await mkdir('docs/previews/gameplay-v17', { recursive: true });
await writeFile('docs/previews/gameplay-v17/audio-analysis.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
