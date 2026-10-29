import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

let root: string, source: string, manifest: string;
const original = resolve('apps/web/public/audio/original-v1/music-runner.mp3');
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'strykalo-instrumentals-'));
  source = join(root, 'записи с пробелами'); manifest = join(root, 'apps/web/src/game/audio/installedInstrumentals.json');
  mkdirSync(source); mkdirSync(join(root, 'tools')); mkdirSync(dirname(manifest), { recursive: true });
  copyFileSync('tools/install-instrumentals.mjs', join(root, 'tools/install-instrumentals.mjs'));
  writeFileSync(manifest, '{}\n');
});
afterEach(() => {
  if (dirname(root) !== resolve(tmpdir()) || !root.includes('strykalo-instrumentals-')) throw new Error('Небезопасный временный путь');
  rmSync(root, { recursive: true, force: true });
});
const install = () => spawnSync(process.execPath, [join(root, 'tools/install-instrumentals.mjs'), source], { encoding: 'utf8' });
const output = () => join(root, 'apps/web/public/audio/user-instrumentals');

describe('установка локальных инструменталов', () => {
  it('распознаёт восемь названий, копирует MP3 без перекодирования и сохраняет незаполненные позиции', () => {
    const titles = ['Ускользает', 'О, брат', '92', 'Делать это трезвым', 'Тени', 'Бесполезно', 'Решится само собой', 'Подворотня — мой дом'];
    for (const title of titles) copyFileSync(original, join(source, `Валентин Стрыкало - ${title} (минус).mp3`));
    const result = install(); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
    const installed = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(Object.keys(installed)).toHaveLength(8);
    for (const filename of Object.values(installed) as string[]) expect(readFileSync(join(output(), filename))).toEqual(readFileSync(original));
    // A later partial import keeps the remaining slots registered.
    for (const filename of readdirSync(source)) rmSync(join(source, filename));
    copyFileSync(original, join(source, '05-teni.mp3'));
    expect(install().status).toBe(0);
    expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual(installed);
  }, 30_000);
  it('не меняет установленные записи при дубликатах поздней песни', () => {
    copyFileSync(original, join(source, 'Ускользает.mp3'));
    copyFileSync(original, join(source, 'Тени.mp3'));
    copyFileSync(original, join(source, '05-teni.mp3'));
    const previous = '{"uskolszaet":"previous.mp3"}\n'; writeFileSync(manifest, previous);
    const result = install(); expect(result.status).toBe(1); expect(result.stderr).toContain('Несколько файлов');
    expect(readFileSync(manifest, 'utf8')).toBe(previous); expect(existsSync(output())).toBe(false);
  });
  it('отклоняет повреждённое аудио без изменения манифеста', () => {
    writeFileSync(join(source, 'Тени.mp3'), 'повреждённый файл');
    const result = install(); expect(result.status).toBe(1); expect(result.stderr).toContain('Не удалось прочитать аудио');
    expect(readFileSync(manifest, 'utf8')).toBe('{}\n'); expect(existsSync(output())).toBe(false);
  });
  it('конвертирует WAV в пригодный MP3', () => {
    const wav = join(source, '04-delat-eto-trezvym.wav');
    const convert = spawnSync('ffmpeg', ['-v', 'error', '-i', original, '-t', '4', wav], { encoding: 'utf8' });
    expect(convert.status, convert.stderr).toBe(0);
    const result = install(); expect(result.status, result.stderr).toBe(0);
    const installed = JSON.parse(readFileSync(manifest, 'utf8'));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(output(), installed['delat-eto-trezvym'])], { encoding: 'utf8' });
    expect(probe.status).toBe(0); expect(Number(probe.stdout)).toBeGreaterThanOrEqual(4);
  }, 10_000);
});
