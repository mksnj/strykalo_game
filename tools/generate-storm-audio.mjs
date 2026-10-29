// Original seeded noise synthesis; no samples, recordings or melodies.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'apps/web/public/audio/visual-v12';
await mkdir(directory, { recursive: true });
const sr = 24000;
let seed = 0x57a012;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 * 2 - 1; };
const audit = [];
for (const [name, seconds] of [['thunder', 3.1], ['rain', 6]]) {
  const n = Math.round(seconds * sr), bytes = Buffer.alloc(44 + n * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sr, 24); bytes.writeUInt32LE(sr * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40);
  let low = 0, deep = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, noise = random(); low += .085 * (noise - low); deep += .018 * (noise - deep);
    const envelope = name === 'thunder' ? Math.min(1, t / .13) * Math.exp(-t / .88) * (.8 + .2 * Math.sin(t * 18))
      : .24 + .045 * Math.sin(t * Math.PI * 2 / seconds);
    const value = name === 'thunder' ? (low * .65 + deep * 2.5) * envelope : (noise - low * .4) * envelope;
    const fade = Math.min(1, i / 240, (n - 1 - i) / 240);
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * fade)) * 28000), 44 + i * 2);
  }
  const path = directory + '/' + name + '.wav'; await writeFile(path, bytes);
  audit.push({ path, seconds, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
}
await writeFile('assets/source/visual-v12/audio-audit.json', JSON.stringify(audit, null, 2) + '\n');
const path = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(path, 'utf8'));
provenance.generatedAssets = provenance.generatedAssets.filter(a => a.collection !== 'storm-audio-v12');
provenance.generatedAssets.push({ collection: 'storm-audio-v12', tool: 'tools/generate-storm-audio.mjs',
  createdOn: '2026-10-28', origin: 'Original deterministic filtered noise, no external samples', assets: audit });
await writeFile(path, JSON.stringify(provenance, null, 2) + '\n');
console.log(audit);
