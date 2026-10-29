import { AUDIO, type SoundFile } from './catalog';

type MusicVoice = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  file: SoundFile;
  url: string;
  fallback: number;
  started: boolean;
  loopOffset: number;
  lastPosition: number;
  startPosition: number;
  end?: number;
  cleanup?: ReturnType<typeof setTimeout>;
};

/**
 * Stream full-length music tracks instead of decoding every track into a large
 * AudioBuffer (which can exhaust a mobile Telegram WebView's memory).
 * A MediaElementAudioSourceNode keeps music on the normal Web Audio mixer bus.
 * Explicit pause/play preserves the song position while the context is suspended.
 */
export class StreamingMusicChannel {
  private voices = new Set<MusicVoice>();
  private desired?: SoundFile;
  private paused = true;
  private disposed = false;
  constructor(private context: AudioContext, private output: AudioNode, private onError: (url: string) => void) {}

  select(file: SoundFile, startAt = 0, startClock?: () => number | undefined): void {
    if (this.disposed || file === this.desired) return;
    this.desired = file;
    // Keep the previous song audible while the next stream buffers. Only start
    // crossfading after the new media element actually begins playback.
    for (const voice of [...this.voices]) {
      if (!voice.started || voice.end !== undefined) this.remove(voice);
    }
    const now = this.context.currentTime;
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    // A user-supplied MP3 can precede the original OGG/MP3 fallback.
    // Without Vorbis support (e.g. iOS), prefer the FIRST MP3, not the LAST URL.
    const preferred = audio.canPlayType('audio/ogg; codecs="vorbis"') ? 0 :
      Math.max(0, file.urls.findIndex(url => /\.mp3(?:[?#]|$)/i.test(url)));
    audio.src = file.urls[preferred];
    const source = this.context.createMediaElementSource(audio), gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    source.connect(gain).connect(this.output);
    const voice: MusicVoice = { audio, source, gain, file, fallback: preferred, url: file.urls[preferred], started: false,
      loopOffset: 0, lastPosition: 0, startPosition: startAt };
    audio.addEventListener('loadedmetadata', () => {
      if (this.voices.has(voice)) this.seekVoice(voice, startClock?.() ?? voice.startPosition);
    });
    audio.addEventListener('playing', () => {
      if (voice.started || this.desired !== file || !this.voices.has(voice)) return;
      voice.started = true;
      const position = startClock?.();
      if (position !== undefined) this.seekVoice(voice, position);
      const at = this.context.currentTime;
      for (const old of [...this.voices]) {
        if (old === voice) continue;
        old.gain.gain.cancelAndHoldAtTime(at);
        old.gain.gain.linearRampToValueAtTime(0, at + AUDIO.crossfade);
        old.end = at + AUDIO.crossfade;
        this.cleanupWhenFaded(old);
      }
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(file.gain, at + AUDIO.crossfade);
    });
    audio.addEventListener('error', () => {
      if (!this.voices.has(voice)) return;
      const next = voice.fallback + 1;
      if (next >= voice.file.urls.length) {
        this.onError(voice.file.urls[0]);
        this.remove(voice);
        if (this.desired === file) this.desired = undefined;
        return;
      }
      voice.fallback = next;
      voice.url = voice.file.urls[next];
      audio.src = voice.url;
      if (!this.paused) this.start(voice);
    });
    this.voices.add(voice);
    audio.load();
    if (!this.paused) this.start(voice);
  }
  /** Align music once at a scene boundary, without changing any world position. */
  seek(file: SoundFile, position: number): void {
    for (const voice of this.voices) if (voice.file === file && voice.end === undefined) {
      voice.startPosition = position;
      if (voice.audio.readyState >= 1) this.seekVoice(voice, position);
    }
  }
  private seekVoice(voice: MusicVoice, position: number): void {
    try {
      // The shipped fallback may be shorter than the installed song's intro offset.
      const duration = voice.audio.duration;
      const at = Number.isFinite(duration) && duration > 0 ? Math.max(0, position) % duration : Math.max(0, position);
      voice.audio.currentTime = at; voice.lastPosition = at; voice.loopOffset = 0;
    } catch { /* Media failure must not block the active-time fallback. */ }
  }

  private start(voice: MusicVoice): void {
    // Mobile browsers can temporarily deny autoplay. A later user gesture calls
    // resume() again. Do not mark NotAllowedError as an unavailable audio file.
    void voice.audio.play().catch(() => {});
  }

  resume(): void {
    if (this.disposed) return;
    this.paused = false;
    for (const voice of this.voices) {
      if (voice.end !== undefined && this.context.currentTime >= voice.end) this.remove(voice);
      else {
        this.start(voice);
        if (voice.end !== undefined) this.cleanupWhenFaded(voice);
      }
    }
  }

  pause(): void {
    this.paused = true;
    for (const voice of this.voices) {
      voice.audio.pause(); clearTimeout(voice.cleanup); voice.cleanup = undefined;
    }
  }

  private cleanupWhenFaded(voice: MusicVoice): void {
    clearTimeout(voice.cleanup); voice.cleanup = undefined;
    const remaining = (voice.end ?? 0) - this.context.currentTime;
    if (remaining <= .005) { this.remove(voice); return; }
    // While suspended, context time stops; resume() resumes cleanup.
    if (this.paused) return;
    voice.cleanup = setTimeout(() => {
      if (!this.voices.has(voice)) return;
      if (this.context.currentTime >= (voice.end ?? Infinity)) this.remove(voice);
      else this.cleanupWhenFaded(voice);
    }, Math.max(100, Math.ceil(remaining * 1000) + 30));
  }

  private remove(voice: MusicVoice): void {
    if (!this.voices.delete(voice)) return;
    clearTimeout(voice.cleanup);
    voice.audio.pause(); voice.audio.removeAttribute('src'); voice.audio.load();
    voice.source.disconnect(); voice.gain.disconnect();
  }

  get status() {
    return [...this.voices].filter(v => v.end === undefined || v.end > this.context.currentTime)
      .map(v => {
        const position = v.audio.currentTime, duration = Number.isFinite(v.audio.duration) ? v.audio.duration : 0;
        if (position < v.lastPosition - .25 && duration > 0) v.loopOffset += duration;
        v.lastPosition = position;
        return { url: v.url, gain: v.gain.gain.value, fading: v.end !== undefined,
          started: v.started, seeking: v.audio.seeking,
          position, elapsed: v.loopOffset + position, duration };
      });
  }

  /** Clear current song for a new run; channel remains reusable. */
  stop(): void {
    this.desired = undefined;
    for (const voice of [...this.voices]) this.remove(voice);
  }

  dispose(): void { this.disposed = true; this.stop(); }
}
