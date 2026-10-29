#!/usr/bin/env node
/** Import user-provided instrumentals. No audio is downloaded by this script. */
import { readdir, readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { resolve, extname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(process.argv[2] ?? join(root, 'instrumentals'));
const out = join(root, 'apps/web/public/audio/user-instrumentals');
const manifestFile = join(root, 'apps/web/src/game/audio/installedInstrumentals.json');
const songs = [
  ['uskolszaet', 'Ускользает'],
  ['o-brat', 'О, брат'],
  ['92', '92'],
  ['delat-eto-trezvym', 'Делать это трезвым'],
  ['teni', 'Тени'],
  ['bespolezno', 'Бесполезно'],
  ['reshitsya-samo-soboy', 'Решится само собой'],
  ['podvorotnya-moy-dom', 'Подворотня — мой дом'],
];
const formats = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']);
const normalized = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
const matches = (base, slug, title, no) => {
  const name = normalized(base);
  const aliases = [slug, `${String(no).padStart(2, '0')}-${slug}`, title].map(normalized);
  // Exact names, or a filename such as "Валентин Стрыкало - Тени (минус)".
  return (slug === '92' && /(^|\D)92(\D|$)/u.test(base)) ||
    aliases.some(a => name === a || (a.length >= 4 && name.includes(a)));
};
const duration = filepath => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filepath], { encoding: 'utf8' });
  return result.status === 0 ? Number(result.stdout.trim()) : NaN;
};
try {
  const entries = (await readdir(source, { withFileTypes: true })).filter(x => x.isFile() && formats.has(extname(x.name).toLowerCase()));
  if (!entries.length) throw new Error(`В папке ${source} не найдены аудиофайлы.`);
  const existing = JSON.parse(await readFile(manifestFile, 'utf8'));
  const installed = { ...existing };
  const jobs = [];
  const selected = new Set();
  for (let i = 0; i < songs.length; i++) {
    const [slug, title] = songs[i];
    const options = entries.filter(entry => matches(basename(entry.name, extname(entry.name)), slug, title, i + 1));
    if (!options.length) continue;
    if (options.length > 1) throw new Error(`Несколько файлов для «${title}»: ${options.map(x => x.name).join(', ')}. Оставьте один.`);
    const input = join(source, options[0].name);
    if (selected.has(input)) throw new Error(`Неоднозначное название файла: ${options[0].name}. Используйте точное имя из раздела о звуке в README.md.`);
    selected.add(input);
    const seconds = duration(input);
    if (!Number.isFinite(seconds) || seconds < 3) throw new Error(`Не удалось прочитать аудио или оно слишком короткое: ${input}. Установите ffmpeg с ffprobe.`);
    const filename = `${String(i + 1).padStart(2, '0')}-${slug}.mp3`;
    jobs.push({ slug, title, input, seconds, filename });
  }
  if (!jobs.length) throw new Error('Подходящих названий песен нет. Переименуйте файлы по образцу из раздела о звуке в README.md.');
  // Validate all source files before changing any previously installed recording.
  await mkdir(out, { recursive: true });
  for (const { slug, title, input, seconds, filename } of jobs) {
    const target = join(out, filename);
    if (extname(input).toLowerCase() === '.mp3') {
      if (resolve(input) !== resolve(target)) await copyFile(input, target);
    } else {
      const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:a:0', '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2', target], { encoding: 'utf8' });
      if (ffmpeg.status !== 0) throw new Error(`Не удалось преобразовать «${title}»: ${ffmpeg.error?.message ?? ffmpeg.stderr?.trim() ?? 'Установите ffmpeg.'}`);
    }
    if ((await stat(target)).size < 1024) throw new Error(`Слишком маленький выходной файл: ${target}`);
    installed[slug] = filename;
    console.log(`✓ ${title}: ${basename(input)} → ${filename} (${Math.round(seconds)} с)`);
  }
  await writeFile(manifestFile, JSON.stringify(installed, null, 2) + '\n');
  console.log(`\nДобавлено/обновлено ${jobs.length} музыкальных файлов. Игра автоматически переключится на них при следующей сборке.`);
  console.log('Существующие композиции для незаполненных эпизодов сохраняются.');
} catch (error) {
  console.error(`Ошибка установки: ${error.message}`);
  process.exitCode = 1;
}
