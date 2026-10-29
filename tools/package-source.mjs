// Package an explicit source inventory so installed dependencies never enter the archive.
import { readdir, mkdir, writeFile, readFile, stat, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const outputDirectory = resolve(root, 'tmp');
await mkdir(outputDirectory, { recursive: true });
const archive = resolve(outputDirectory, process.platform === 'win32' ? 'strykalo-source.zip' : 'strykalo-source.tar.gz');
const list = resolve(outputDirectory, 'source-files.json');
const forbiddenDirectories = new Set(['node_modules', 'dist', '.git', '.npm-cache',
  'test-results', 'playwright-report', 'tmp', '.aws', '.codex', '.agents', 'instrumentals']);
const forbiddenFile = name => (name.startsWith('.env') && name !== '.env.example') ||
  /\.(?:log|pem|key|pfx|zip|rar|tar|gz)$/i.test(name);
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Ссылка не включается в исходники: ${relative(root, path)}`);
    if (entry.isDirectory()) {
      if (!forbiddenDirectories.has(entry.name)) await collect(path);
    } else if (entry.isFile() && !forbiddenFile(entry.name)) files.push(relative(root, path).split(sep).join('/'));
  }
}
await collect(root);
files.sort();
for (const required of ['package-lock.json', '.env.example', 'README.md', 'AGENTS.md',
  'assets/source/provenance.json', 'docs/history/documentation-archive.json',
  'apps/web/public/audio/original-v1/LICENSE.md']) {
  if (!files.includes(required)) throw new Error(`Обязательный файл отсутствует: ${required}`);
}
if (!files.some(path => path.startsWith('assets/source/') && path.endsWith('PROMPTS.md')))
  throw new Error('Исходные промпты отсутствуют');
await writeFile(list, JSON.stringify(files));
// Refuse a redirected tmp directory or an output symlink before writing the archive.
if (await realpath(outputDirectory) !== outputDirectory) throw new Error('Каталог архива перенаправлен');
try {
  if ((await lstat(archive)).isSymbolicLink()) throw new Error('Путь архива является ссылкой');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
function tar(args) {
  const result = spawnSync('tar', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result.stdout;
}
let included;
if (process.platform === 'win32') {
  // .NET preserves UTF-8 names; Windows bsdtar misreads Cyrillic names from a UTF-8 -T list.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resolve(root, 'tools/package-source.ps1'), '-ProjectRoot', root, '-Inventory', list, '-Archive', archive],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  included = JSON.parse(result.stdout).sort();
} else {
  const textList = resolve(outputDirectory, 'source-files.txt');
  await writeFile(textList, files.join('\n') + '\n');
  tar(['-czf', archive, '-T', textList]);
  included = tar(['-tzf', archive]).trim().split(/\r?\n/).map(path => path.replace(/^\.\//, '')).sort();
}
if (JSON.stringify(included) !== JSON.stringify(files)) throw new Error('Содержимое архива отличается от списка исходников');
const bytes = await readFile(archive);
const report = { archive: basename(archive), files: files.length, bytes: (await stat(archive)).size,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  excludedDirectories: [...forbiddenDirectories], inventory: files };
await writeFile(resolve(outputDirectory, 'source-archive-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Создан tmp/${basename(archive)}: ${files.length} файлов, ${(bytes.length / 1024 / 1024).toFixed(1)} МиБ. Состав проверен; node_modules исключён.`);
