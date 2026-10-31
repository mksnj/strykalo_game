import { MUSIC_TRANSITIONS, type MusicTransition, type SoundFile } from './catalog';

type Envelope = { start: number; end: number; from: number; to: number };
type MusicVoice = {
  id: number;
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
  envelope: Envelope;
  fadeInStartedAt?: number;
  fadeOutStartedAt?: number;
  end?: number;
  cleanup?: ReturnType<typeof setTimeout>;
  meters?: { input: AnalyserNode; output: AnalyserNode; data: Float32Array<ArrayBuffer> };
};
type MusicEvent = { id: number; url: string; type: 'playing' | 'fade-out' | 'fade-complete' | 'released';
  time: number; gain: number; end?: number; reason?: string };

const level = (e: Envelope, time: number) => {
  const t = Math.max(0, Math.min(1, (time - e.start) / Math.max(.000001, e.end - e.start)));
  return e.from + (e.to - e.from) * t * t * (3 - 2 * t);
};

/** Full songs stay streamed, including outgoing tails (no decoded album in mobile RAM). */
export class StreamingMusicChannel {
  private voices = new Set<MusicVoice>();
  private desired?: SoundFile;
  private prepared?: { file: SoundFile; audio: HTMLAudioElement; preferred: number };
  private paused = true;
  private disposed = false;
  private nextId = 0;
  private diagnostics = false;
  private events: MusicEvent[] = [];
  constructor(private context: AudioContext, private output: AudioNode, private onError: (url: string) => void) {}

  private element(file: SoundFile) {
    const audio = document.createElement('audio');
    audio.preload = 'auto'; audio.loop = true; audio.crossOrigin = 'anonymous';
    const preferred = audio.canPlayType('audio/ogg; codecs="vorbis"') ? 0 :
      Math.max(0, file.urls.findIndex(url => /\.mp3(?:[?#]|$)/i.test(url)));
    audio.src = file.urls[preferred];
    return { file, audio, preferred };
  }
  /** One bounded lookahead stream; playback and story cues are never advanced. */
  prepare(file: SoundFile): void {
    if (this.disposed || file === this.desired || file === this.prepared?.file) return;
    this.clearPrepared(); this.prepared = this.element(file); this.prepared.audio.load();
  }
  private clearPrepared(): void {
    if (!this.prepared) return;
    this.prepared.audio.removeAttribute('src'); this.prepared.audio.load(); this.prepared = undefined;
  }

  select(file: SoundFile, startAt = 0, startClock?: () => number | undefined,
    transition: MusicTransition = MUSIC_TRANSITIONS.story, restart = false): void {
    if (this.disposed || file === this.desired && !restart) return;
    this.desired = file;
    // Only silent, unstarted requests may be cancelled. Audible tails retain their deadlines.
    for (const voice of [...this.voices]) if (!voice.started) this.remove(voice, 'superseded-before-playing');
    const prepared = this.prepared?.file === file ? this.prepared : this.element(file);
    if (prepared === this.prepared) this.prepared = undefined;
    const { audio, preferred } = prepared;
    const at = this.context.currentTime;
    const source = this.context.createMediaElementSource(audio), gain = this.context.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, at); source.connect(gain).connect(this.output);
    const voice: MusicVoice = { id: ++this.nextId, audio, source, gain, file, fallback: preferred,
      url: file.urls[preferred], started: false, loopOffset: 0, lastPosition: 0, startPosition: startAt,
      envelope: { start: at, end: at, from: 0, to: 0 } };
    let playbackConfirmed = false;
    const begin = () => {
      // A seek must finish before retiring the old song.
      if (!playbackConfirmed || voice.started || audio.paused || audio.seeking || audio.readyState < 3 || this.paused ||
        this.desired !== file || !this.voices.has(voice)) return;
      voice.started = true;
      const now = this.context.currentTime;
      voice.fadeInStartedAt = now;
      voice.envelope = { start: now, end: now + transition.fadeIn, from: 0, to: file.gain };
      this.record(voice, 'playing');
      for (const old of this.voices) if (old !== voice && old.started && old.end === undefined) this.fadeOut(old, transition.fadeOut);
      this.schedule();
    };
    audio.addEventListener('loadedmetadata', () => {
      if (this.voices.has(voice)) this.seekVoice(voice, startClock?.() ?? voice.startPosition);
    });
    audio.addEventListener('playing', () => {
      playbackConfirmed = true;
      const position = startClock?.();
      if (!voice.started && position !== undefined && Math.abs(audio.currentTime - position) > .05) this.seekVoice(voice, position);
      begin();
    });
    audio.addEventListener('seeked', begin);
    audio.addEventListener('canplay', begin);
    audio.addEventListener('error', () => {
      if (!this.voices.has(voice)) return;
      const next = voice.fallback + 1;
      if (next >= file.urls.length) {
        this.onError(file.urls[0]); this.remove(voice, 'media-error');
        if (this.desired === file) this.desired = undefined;
        return;
      }
      voice.fallback = next; voice.url = file.urls[next]; audio.src = voice.url;
      if (!this.paused) this.start(voice);
    });
    this.voices.add(voice);
    if (this.diagnostics) this.attachMeters(voice);
    if (audio.readyState >= 1) this.seekVoice(voice, startClock?.() ?? startAt);
    else audio.load();
    if (!this.paused) this.start(voice);
  }

  seek(file: SoundFile, position: number): void {
    for (const voice of this.voices) if (voice.file === file && voice.end === undefined) {
      voice.startPosition = position;
      if (voice.audio.readyState >= 1) this.seekVoice(voice, position);
    }
  }
  private seekVoice(voice: MusicVoice, position: number): void {
    try {
      const duration = voice.audio.duration;
      const at = Number.isFinite(duration) && duration > 0 ? Math.max(0, position) % duration : Math.max(0, position);
      voice.audio.currentTime = at; voice.lastPosition = at; voice.loopOffset = 0;
    } catch { /* Media failure must not block the active-time fallback. */ }
  }
  private start(voice: MusicVoice): void {
    // Autoplay denial is retried on the next gesture without fading the old song.
    void voice.audio.play().catch(() => {});
  }
  resume(): void {
    if (this.disposed) return;
    this.paused = false;
    for (const voice of this.voices) {
      if (voice.end !== undefined && this.context.currentTime >= voice.end) this.remove(voice, 'fade-complete');
      else { this.start(voice); if (voice.end !== undefined) this.cleanupWhenFaded(voice); }
    }
  }
  pause(): void {
    this.paused = true;
    for (const voice of this.voices) { voice.audio.pause(); clearTimeout(voice.cleanup); voice.cleanup = undefined; }
  }
  private fadeOut(voice: MusicVoice, seconds: number): void {
    const now = this.context.currentTime;
    voice.envelope = { start: now, end: now + seconds, from: level(voice.envelope, now), to: 0 };
    voice.fadeOutStartedAt = now; voice.end = now + seconds;
    this.record(voice, 'fade-out'); this.cleanupWhenFaded(voice);
  }

  /** Smoothstep curves with a shared power budget keep overlapping songs from raising the mix.
   * Ramps execute on the audio clock, independently of frames and cleanup timers.
   * Explicit anchors also support browsers without cancelAndHoldAtTime.
   */
  private schedule(): void {
    const now = this.context.currentTime, voices = [...this.voices];
    const end = Math.max(now, ...voices.map(v => v.envelope.end));
    const times = new Set([now, end, ...voices.map(v => Math.max(now, v.envelope.end))]);
    for (let t = now + 1 / 60; t < end; t += 1 / 60) times.add(t);
    const ordered = [...times].sort((a, b) => a - b);
    for (const voice of voices) voice.gain.gain.cancelScheduledValues(now);
    for (const time of ordered) {
      const values = voices.map(v => level(v.envelope, time));
      const power = values.reduce((sum, value, i) => sum + (value / Math.max(.000001, voices[i].file.gain)) ** 2, 0);
      const scale = 1 / Math.sqrt(Math.max(1, power));
      voices.forEach((v, i) => {
        if (time === now) v.gain.gain.setValueAtTime(values[i] * scale, time);
        else v.gain.gain.linearRampToValueAtTime(values[i] * scale, time);
      });
    }
  }
  private cleanupWhenFaded(voice: MusicVoice): void {
    clearTimeout(voice.cleanup); voice.cleanup = undefined;
    const remaining = (voice.end ?? Infinity) - this.context.currentTime;
    if (remaining <= 0) { this.remove(voice, 'fade-complete'); return; }
    if (this.paused) return;
    voice.cleanup = setTimeout(() => {
      if (this.voices.has(voice)) this.cleanupWhenFaded(voice);
    }, Math.max(25, Math.ceil(remaining * 1000) + 20));
  }
  private record(voice: MusicVoice, type: MusicEvent['type'], reason?: string): void {
    this.events.push({ id: voice.id, url: voice.url, type, time: this.context.currentTime,
      gain: voice.gain.gain.value, end: voice.end, reason });
    if (this.events.length > 256) this.events.shift();
  }
  private remove(voice: MusicVoice, reason: string): void {
    if (!this.voices.delete(voice)) return;
    if (reason === 'fade-complete') this.record(voice, 'fade-complete');
    this.record(voice, 'released', reason);
    clearTimeout(voice.cleanup);
    voice.audio.pause(); voice.audio.removeAttribute('src'); voice.audio.load();
    voice.source.disconnect(); voice.gain.disconnect();
    voice.meters?.input.disconnect(); voice.meters?.output.disconnect();
  }
  enableDiagnostics(): void {
    this.diagnostics = true;
    for (const voice of this.voices) this.attachMeters(voice);
  }
  private attachMeters(voice: MusicVoice): void {
    if (voice.meters) return;
    const input = this.context.createAnalyser(), output = this.context.createAnalyser();
    input.fftSize = output.fftSize = 2048;
    voice.source.connect(input); voice.gain.connect(output);
    voice.meters = { input, output, data: new Float32Array(2048) };
  }
  get history() { return this.events.map(event => ({ ...event })); }
  get status() {
    return [...this.voices].map(v => {
      const position = v.audio.currentTime, duration = Number.isFinite(v.audio.duration) ? v.audio.duration : 0;
      if (position < v.lastPosition - .25 && duration > 0) v.loopOffset += duration;
      v.lastPosition = position;
      const rms = (node: AnalyserNode) => {
        const data = v.meters!.data; node.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length);
      };
      return { id: v.id, url: v.url, gain: v.gain.gain.value, fading: v.end !== undefined,
        started: v.started, paused: v.audio.paused, ended: v.audio.ended, readyState: v.audio.readyState,
        seeking: v.audio.seeking, fadeOutStartedAt: v.fadeOutStartedAt, fadeOutEndsAt: v.end,
        fadeInStartedAt: v.fadeInStartedAt,
        inputRms: v.meters ? rms(v.meters.input) : undefined, outputRms: v.meters ? rms(v.meters.output) : undefined,
        position, elapsed: v.loopOffset + position, duration };
    });
  }
  /** Graceful silence. Only explicit stop(0)/dispose is an emergency release. */
  stop(fadeSeconds = MUSIC_TRANSITIONS.story.fadeOut): void {
    this.desired = undefined; this.clearPrepared();
    for (const voice of [...this.voices]) {
      if (!voice.started || fadeSeconds <= 0) this.remove(voice, fadeSeconds <= 0 ? 'emergency' : 'not-started');
      else if (voice.end === undefined) this.fadeOut(voice, fadeSeconds);
    }
    this.schedule();
  }
  dispose(): void { this.disposed = true; this.stop(0); }
}
