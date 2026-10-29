import type { SoundFile } from './catalog';
/** Shared decoded buffers; MP3 fallback when OGG is unsupported. */
export class BufferLibrary {
  private pending = new Map<string, Promise<AudioBuffer>>();
  private requests = new AbortController();
  constructor(private context: AudioContext, private onError: (url: string) => void) {}
  load(file: SoundFile): Promise<AudioBuffer> {
    const key = file.urls.join('|'), cached = this.pending.get(key);
    if (cached) return cached;
    const promise = this.decode(file).catch(error => { this.pending.delete(key); throw error; });
    this.pending.set(key, promise); return promise;
  }
  private async decode(file: SoundFile): Promise<AudioBuffer> {
    for (const url of file.urls) {
      try {
        const response = await fetch(url, { signal: this.requests.signal });
        if (!response.ok) throw new Error(String(response.status));
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch { if (this.requests.signal.aborted) throw new Error('Audio disposed'); }
    }
    this.onError(file.urls[0]); throw new Error('Audio unavailable');
  }
  dispose(): void { this.requests.abort(); this.pending.clear(); }
}
