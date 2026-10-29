// Signal measurements help select candidates; they cannot identify sung words.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const reports = [];
for (const name of ['03-92.mp3', '05-teni.mp3']) {
  const file = 'apps/web/public/audio/user-instrumentals/' + name, rate = 4000;
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-t', '70', '-af',
    'highpass=f=300,lowpass=f=1800', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 2e6 });
  if (decoded.error || decoded.status !== 0) throw decoded.error ?? new Error(decoded.stderr.toString());
  const data = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.length / 4);
  const energy = (from, seconds) => {
    let sum = 0; const end = Math.min(data.length, Math.round((from + seconds) * rate)), start = Math.round(from * rate);
    for (let i = start; i < end; i++) sum += data[i] ** 2;
    return +Math.sqrt(sum / (end - start)).toFixed(5);
  };
  const perSecond = Array.from({ length: 65 }, (_, seconds) => ({ seconds, rms: energy(seconds, 1) }));
  const peaks = [];
  for (let t = 26; t < 31; t += .01) peaks.push({ seconds: +t.toFixed(2), rms: energy(t, .05) });
  const selected = [];
  for (const p of peaks.sort((a, b) => b.rms - a.rms)) if (selected.every(v => Math.abs(v.seconds - p.seconds) >= 1.1)) selected.push(p);
  reports.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
    method: '300–1800 Hz band, one-second RMS; 50 ms windows in 26–31 s', perSecond,
    accentCandidates: selected.slice(0, 4).sort((a, b) => a.seconds - b.seconds), listeningVerified: false,
    note: 'Energy is not proof of vocal onset or lyric timing. Configuration requires listening calibration.' });
}
await mkdir('docs/previews/gameplay-v18', { recursive: true });
await writeFile('docs/previews/gameplay-v18/audio-analysis.json', JSON.stringify(reports, null, 2) + '\n');
for (const r of reports) console.log(r.file, JSON.stringify({ perSecond: r.perSecond, accents: r.accentCandidates }));
