import { AUDIO, type SoundFile } from './catalog';
import type { BufferLibrary } from './BufferLibrary';
type Voice = { source: AudioBufferSourceNode; gain: GainNode; file: SoundFile; end?: number };
/** At most two voices during a fade. Stale async loads cannot start a track. */
export class LoopChannel {
  private revision = 0;
  private desired?: SoundFile;
  private voices = new Set<Voice>();
  constructor(private context: AudioContext, private output: AudioNode, private library: BufferLibrary) {}
  async select(file: SoundFile): Promise<void> {
    if (this.desired === file) return;
    this.desired = file;
    const revision = ++this.revision;
    try {
      const buffer = await this.library.load(file);
      if (revision !== this.revision) return;
      const now = this.context.currentTime;
      for (const voice of [...this.voices]) {
        if (voice.end !== undefined) this.remove(voice);
        else {
          voice.gain.gain.cancelAndHoldAtTime(now);
          voice.gain.gain.linearRampToValueAtTime(0, now + AUDIO.crossfade);
          voice.end = now + AUDIO.crossfade; voice.source.stop(voice.end);
        }
      }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; source.loop = true;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(file.gain, now + AUDIO.crossfade);
      source.connect(gain).connect(this.output);
      const voice: Voice = { source, gain, file };
      source.onended = () => this.remove(voice);
      this.voices.add(voice); source.start();
    } catch { if (revision === this.revision) this.desired = undefined; }
  }
  private remove(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already ended. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  get status() {
    return [...this.voices].filter(v => v.end === undefined || v.end > this.context.currentTime)
      .map(v => ({ url: v.file.urls[0], gain: v.gain.gain.value, fading: v.end !== undefined }));
  }
  dispose(): void { this.revision++; this.desired = undefined; for (const voice of [...this.voices]) this.remove(voice); }
}
