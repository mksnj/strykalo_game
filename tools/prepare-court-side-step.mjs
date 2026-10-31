// Preserve the supplied PNG byte for byte; timing and placement are runtime configuration.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import layout from '../apps/web/src/game/assets/sideStepLayout.json' with { type: 'json' };

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inputsAt(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await inputsAt(path));
    else {
      const bytes = await readFile(path);
      files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  return files;
}
const inputs = await inputsAt(layout.source);
const bytes = await readFile(`${layout.source}/sprite_sheet.png`);
const path = `apps/web/public${layout.url}`, source = `assets/source/${layout.collection}`;
await mkdir(dirname(path), { recursive: true });
await mkdir(source, { recursive: true });
await writeFile(path, bytes);
await writeFile('apps/web/src/game/assets/sideStepAnimations.json', await readFile(`${layout.source}/animations.json`));
const audit = {
  method: 'Byte-for-byte copy of the owner-provided transparent sprite sheet; no image editing or generation',
  inputs, output: { path, bytes: bytes.length, sha256: hash(bytes), width: layout.width, height: layout.height },
  runtime: {
    layout: 'apps/web/src/game/assets/sideStepLayout.json',
    timing: 'Source clips keep every duration_ms and loop flag. Rhythm hits skip only the initial 460ms/360ms idle hold; movement, planted holds, returns and the preview loop retain their authored timing',
    placement: 'courtHeroLayout.json calibrates fixed width/height to ordinary idle; origin at alpha foot edge 589/608; lateral motion already in pixels, no extra translation',
    preserved: 'Original files, atlas, animation metadata, reference prompts and previews remain in hooded_step_game_sprites'
  }
};
await writeFile(`${source}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
const provenancePath = 'assets/source/provenance.json';
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
provenance.generatedAssets = provenance.generatedAssets.filter(entry => entry.collection !== layout.collection);
provenance.generatedAssets.push({ collection: layout.collection, createdOn: '2026-10-31',
  tool: audit.method, source: layout.source, audit: `${source}/audit.json`,
  license: 'Owner-provided assets; original metadata preserved; no new license assigned', assets: audit });
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify(audit.output));
