// Check the canonical README, short pointers and their anchors; never traverse dependencies.
import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function markdown(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? markdown(path) : entry.name.endsWith('.md') ? [path] : [];
  }));
  return files.flat();
}
const rootMarkdown = (await readdir(root)).filter(name => name.endsWith('.md'));
const files = [...rootMarkdown, ...await markdown('docs'), ...await markdown('assets/source'),
  'apps/web/public/audio/original-v1/LICENSE.md'];
const missing = [];
let checked = 0;
const anchorCache = new Map();
async function hasAnchor(path, anchor) {
  if (!anchorCache.has(path)) {
    const text = await readFile(path, 'utf8');
    const anchors = new Set([...text.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
    for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
      anchors.add(match[1].toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s/g, '-'));
    }
    anchorCache.set(path, anchors);
  }
  return anchorCache.get(path).has(anchor);
}
for (const file of files) {
  // Code examples and historical literal paths are not clickable links.
  const body = (await readFile(resolve(root, file), 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const match of body.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) continue;
    const [target, fragment] = href.split('#');
    const path = target ? resolve(dirname(resolve(root, file)), decodeURIComponent(target)) : resolve(root, file);
    try {
      await access(path);
      if (fragment && !await hasAnchor(path, decodeURIComponent(fragment))) {
        missing.push(`${file}: отсутствует раздел ${href}`);
      } else checked++;
    }
    catch { missing.push(`${file}: ${href} -> ${relative(root, path)}`); }
  }
}
if (missing.length) {
  console.error('Отсутствующие локальные ссылки:\n' + missing.join('\n'));
  process.exitCode = 1;
} else console.log(`Проверено ${checked} локальных ссылок в ${files.length} Markdown-файлах.`);
