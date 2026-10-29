// Original offline sound design, with no recordings, samples or borrowed melodies.
// Requires ffmpeg on PATH. Rebuild: node tools/generate-audio.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../apps/web/public/audio/original-v1/', import.meta.url);
const scratch = new URL('../tmp/audio/', import.meta.url);
await mkdir(root, { recursive: true }); await mkdir(scratch, { recursive: true });
const SR = 32000, TAU = Math.PI * 2;
let seed = 0x813b11;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const noise = () => random() * 2 - 1;
const make = seconds => [new Float32Array(Math.round(seconds * SR)), new Float32Array(Math.round(seconds * SR))];
function add(target, signal, offset = 0, volume = 1, pan = 0) {
  const start = Math.round(offset * SR), gains = [Math.sqrt((1 - pan) / 2), Math.sqrt((1 + pan) / 2)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < signal.length; i++) {
    const index = (start + i) % target[c].length;
    target[c][index] += signal[i] * volume * gains[c];
  }
}
function filteredNoise(seconds, cutoff = 900, highpass = 40) {
  const data = new Float32Array(Math.round(seconds * SR));
  const lo = 1 - Math.exp(-TAU * cutoff / SR), hi = 1 - Math.exp(-TAU * highpass / SR);
  let low = 0, dc = 0;
  for (let i = 0; i < data.length; i++) { low += lo * (noise() - low); dc += hi * (low - dc); data[i] = low - dc; }
  return data;
}
function burst(seconds, cutoff, decay, attack = .003) {
  const signal = filteredNoise(seconds, cutoff);
  for (let i = 0; i < signal.length; i++) { const t = i / SR; signal[i] *= Math.min(1, t / attack) * Math.exp(-t / decay); }
  return signal;
}
function resonance(seconds, frequencies, decay, friction = .03) {
  const signal = filteredNoise(seconds, 2500);
  const phases = frequencies.map(() => random() * TAU);
  for (let i = 0; i < signal.length; i++) {
    const t = i / SR;
    let sample = signal[i] * friction;
    frequencies.forEach((frequency, h) => { sample += Math.sin(TAU * frequency * t + phases[h]) / (h + 1) * .18; });
    signal[i] = sample * Math.min(1, t / .002) * Math.exp(-t / decay);
  }
  return signal;
}
function reverb(track, wet = .14, circular = false) {
  for (let c = 0; c < 2; c++) {
    const dry = track[c].slice();
    for (const [seconds, gain] of [[.071, .44], [.131, .32], [.227, .24], [.391, .15], [.613, .08]]) {
      const offset = Math.round((seconds + c * .011) * SR);
      for (let i = 0; i < dry.length; i++) {
        const to = i + offset;
        if (to < dry.length || circular) track[c][to % dry.length] += dry[i] * wet * gain;
      }
    }
  }
}
function softenEnds(track, loop = false) {
  const n = track[0].length, fade = Math.round(SR * (loop ? .04 : .012));
  for (const data of track) for (let i = 0; i < fade; i++) { const envelope = Math.sin(i / fade * Math.PI / 2) ** 2; data[i] *= envelope; data[n - 1 - i] *= envelope; }
}
function wav(track) {
  const buffer = Buffer.alloc(44 + track[0].length * 4), n = track[0].length;
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SR, 24); buffer.writeUInt32LE(SR * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track[c][i])) * 32767), 44 + i * 4 + c * 2);
  return buffer;
}
const report = [];
async function save(name, track, loop = false, peak = .65) {
  reverb(track, name.startsWith('music') ? .5 : .12, loop); softenEnds(track, loop);
  let max = 0, sum = 0;
  for (const data of track) for (const value of data) { max = Math.max(max, Math.abs(value)); sum += value * value; }
  const scale = peak / Math.max(max, .00001);
  for (const data of track) for (let i = 0; i < data.length; i++) data[i] *= scale;
  const input = fileURLToPath(new URL(name + '.wav', scratch));
  await writeFile(input, wav(track));
  for (const ext of ['ogg', 'mp3']) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map_metadata', '-1',
      '-c:a', ext === 'ogg' ? 'libvorbis' : 'libmp3lame', ...(ext === 'ogg' ? ['-q:a', '4'] : ['-b:a', '128k']),
      fileURLToPath(new URL(name + '.' + ext, root))];
    const result = spawnSync('ffmpeg', args, { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  }
  report.push({ name, seconds: track[0].length / SR, loop, peak, rms: Math.sqrt(sum / (track[0].length * 2)) * scale });
  console.log(name);
}

// Non-melodic, slowly evolving bowed/drifting textures, granular dust and distant soft impacts.
// Every harmonic completes an integer number of cycles in 24 s for a stable loop boundary.
const voicings = [[55, 82.4, 116.54, 164.8], [46.25, 69.3, 103.83, 146.83],
  [51.91, 77.78, 110, 155.56], [43.65, 65.4, 98, 130.81], [49, 73.42, 110, 164.81]];
for (const [index, scene] of ['runner', 'balance', 'stars', 'waiting', 'ending'].entries()) {
  const track = make(24), dust = filteredNoise(24, 1200, 180);
  for (let c = 0; c < 2; c++) {
    const air = filteredNoise(24, 420 + index * 80, 60);
    for (let i = 0; i < track[c].length; i++) {
      const t = i / SR;
      let value = air[i] * .035 + dust[i] * .006;
      for (let v = 0; v < 4; v++) {
        const frequency = Math.round(voicings[index][v] * 24 + c * (v % 2 ? 2 : -1)) / 24;
        const swell = .3 + .7 * (.5 + .5 * Math.sin(TAU * t / 24 + v * 1.7 + index)) ** 2;
        // Soft bowed harmonic spectrum with irregular breath, rather than bare electronic tones.
        for (let h = 1; h <= 7; h++) value += Math.sin(TAU * frequency * h * t + Math.sin(TAU * t / 24) * .15 * h)
          * swell * (1 + air[i] * .14) * .026 / h ** 1.8;
      }
      track[c][i] = value;
    }
  }
  for (let j = 0; j < 9; j++) add(track, burst(.12 + random() * .22, 950, .04), random() * 24, .008, noise() * .7);
  await save('music-' + scene, track, true, .38);
}

for (const [index, scene] of ['street', 'pipe', 'room', 'ending'].entries()) {
  const track = make(12);
  for (let c = 0; c < 2; c++) {
    const wind = filteredNoise(12, scene === 'room' ? 450 : 1600, 50), traffic = filteredNoise(12, 190, 35);
    for (let i = 0; i < track[c].length; i++) {
      const t = i / SR, gust = .28 + .25 * Math.sin(TAU * t / 12 + c + index) + .18 * Math.sin(TAU * t / 6 + 1.2);
      track[c][i] = wind[i] * gust * .3 + traffic[i] * (.3 + .2 * Math.cos(TAU * t / 12 + c)) * .8;
    }
  }
  if (scene === 'room') { add(track, burst(.2, 340, .07), 4, .03, -.5); add(track, burst(.16, 550, .05), 8.3, .02, .5); }
  await save('ambient-' + scene, track, true, scene === 'room' ? .22 : .38);
}
const cassette = make(.28);
add(cassette, burst(.06, 6500, .008), .009, .8);
add(cassette, resonance(.09, [830, 1320, 2400], .012, .25), .012, .45);
add(cassette, burst(.09, 4200, .015), .065, .5, .2);
add(cassette, burst(.23, 2800, .06, .015), .035, .2, -.15);
await save('cassette', cassette);
for (const [name, weight, length] of [['jump', .45, .35], ['land', 1, .5], ['step-left', .65, .3], ['step-right', .6, .32], ['collision', 1.6, .9], ['star-hit', 1.4, 1.1]]) {
  const track = make(length);
  add(track, burst(length * .8, 450, .055 * weight), .005, .9);
  add(track, burst(length * .7, 3800, .045 * weight, .005), .024, .55);
  add(track, resonance(length * .7, name.includes('hit') ? [57, 83, 171] : [87, 144, 215], .04 * weight, .2), .012, .5);
  add(track, burst(length * .6, 1800, .04, .012), length * .2, .35);
  await save(name, track);
}
for (const [name, seconds, frequencies] of [['pipe-creak', 1.8, [173, 391, 793, 1243]], ['door-creak', 2.5, [133, 287, 549, 813]]]) {
  const track = make(seconds), friction = filteredNoise(seconds, 2200, 120);
  const signal = new Float32Array(track[0].length);
  let phase = 0;
  for (let i = 0; i < signal.length; i++) {
    const t = i / SR, progress = t / seconds;
    phase += TAU * (1 + .1 * Math.sin(t * 13) + .09 * friction[i]) / SR;
    const pressure = Math.sin(progress * Math.PI) ** 1.4 * (.5 + .5 * Math.sin(t * 47) ** 2);
    signal[i] = (frequencies.reduce((sum, f, h) => sum + Math.sin(phase * f) * .07 / (h + 1), 0) + friction[i] * .14) * pressure;
  }
  add(track, signal, 0, .8, -.25); await save(name, track, false, .5);
}
const gust = make(3.2), air = filteredNoise(3.2, 1800, 75);
for (let i = 0; i < air.length; i++) air[i] *= Math.sin(i / air.length * Math.PI) ** 2;
add(gust, air, 0, .8, -.3); add(gust, air, .06, .6, .5); await save('wind-gust', gust, false, .48);
const star = make(1.1), rush = filteredNoise(1.1, 6000, 600);
for (let i = 0; i < rush.length; i++) rush[i] *= Math.sin(i / rush.length * Math.PI) ** 3 * (.3 + i / rush.length);
add(star, rush, 0, .8, -.4); add(star, rush, .024, .5, .6); await save('star-fall', star, false, .5);
const tick = make(.15); add(tick, burst(.06, 5200, .006), .003, .7); add(tick, resonance(.1, [980, 1843], .009), .005, .6);
await save('clock-tick', tick, false, .4);
const clock = make(1.4); add(clock, resonance(1.3, [1063, 1693, 2831], .28), .01, .5); await save('clock-chime', clock, false, .45);
const neon = make(.65);
for (const t of [.01, .065, .14, .29, .38]) add(neon, burst(.08, 4200, .016), t, .45);
add(neon, burst(.5, 900, .16, .02), .05, .15); await save('neon-flicker', neon, false, .4);
await writeFile(new URL('analysis.json', scratch), JSON.stringify(report, null, 2));
console.log(`${report.length} original sounds encoded as OGG + MP3; analysis: tmp/audio/analysis.json`);
