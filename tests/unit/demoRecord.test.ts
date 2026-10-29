import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDemoRecord, saveDemoRecord } from '../../apps/web/src/services/demoRecord';
afterEach(() => vi.unstubAllGlobals());
describe('локальный деморекорд', () => {
  it('использует лучшую отдельную попытку, а не сумму', () => {
    let value: string | null = null;
    vi.stubGlobal('localStorage', { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } });
    expect(saveDemoRecord(5)).toBe(5); expect(saveDemoRecord(3)).toBe(5);
    expect(saveDemoRecord(7)).toBe(7); expect(readDemoRecord()).toBe(7);
  });
  it('работает при заблокированном хранилище', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(readDemoRecord()).toBe(0); expect(saveDemoRecord(3)).toBe(3);
  });
  it('отбрасывает повреждённый рекорд', () => {
    vi.stubGlobal('localStorage', { getItem: () => '-7' }); expect(readDemoRecord()).toBe(0);
    vi.stubGlobal('localStorage', { getItem: () => 'garbage' }); expect(readDemoRecord()).toBe(0);
  });
});
