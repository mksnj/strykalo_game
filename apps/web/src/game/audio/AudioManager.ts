import type { RoomEvent } from '../minigames/waiting/WaitingEngine';
import { AMBIENCE, AMBIENT_EFFECTS, AUDIO, EFFECTS, MUSIC, soundscape, type Effect, type SoundFile, type MusicScene } from './catalog';
import { BufferLibrary } from './BufferLibrary';
import { LoopChannel } from './LoopChannel';
import { StreamingMusicChannel } from './StreamingMusicChannel';
import { AUTUMN_SCORE, SHADOWS_SCORE } from '../config';

/** File-backed mixer. Suspending one context preserves every loop playhead and fade. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private ambientBus?: GainNode;
  private library?: BufferLibrary;
  private music?: StreamingMusicChannel;
  private ambience?: LoopChannel;
  private voices = new Set<AudioBufferSourceNode>();
  private activeEffects = new Set<Effect>();
  private pendingEffects = new Set<Effect>();
  private lastEffect = new Map<Effect, number>();
  private effectRevision = 0;
  private quiet = 0;
  private muted = false;
  private musicVolume: number = AUDIO.musicVolume;
  private effectsVolume: number = AUDIO.effectsVolume;
  private ambientVolume: number = AUDIO.ambientVolume;
  private scene = 'runner';
  private paused = true;
  private sceneSelectedAt = 0;
  private lastMusicPosition?: number;
  private lastMusicAdvanceAt = 0;
  private disposed = false;
  private autumnClock?: () => number | undefined;
  private errors = new Set<string>();
  private effectTailUntil = 0;
  private finaleOverride: SoundFile | undefined = import.meta.env.VITE_FINALE_AUDIO_URL
    ? { urls: [import.meta.env.VITE_FINALE_AUDIO_URL], gain: MUSIC.ending.gain } : undefined;
  followAutumn(clock: () => number | undefined): void { this.autumnClock = clock; }
  unlock(): void {
    if (this.disposed) return;
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.context = new Context();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 8; limiter.ratio.value = 8;
        this.master.connect(limiter).connect(this.context.destination);
        this.musicBus = this.context.createGain(); this.effectsBus = this.context.createGain(); this.ambientBus = this.context.createGain();
        this.musicBus.connect(this.master); this.effectsBus.connect(this.master); this.ambientBus.connect(this.master);
        this.library = new BufferLibrary(this.context, url => this.errors.add(url));
        this.music = new StreamingMusicChannel(this.context, this.musicBus, url => this.errors.add(url));
        this.ambience = new LoopChannel(this.context, this.ambientBus, this.library);
        this.applyVolumes(true); this.selectScene();
        for (const file of Object.values(EFFECTS)) void this.library.load(file).catch(() => { });
      }
      this.paused = false;
      this.music?.resume();
      if (this.context.state !== 'running') void this.context.resume().then(() => {
        if (this.paused && this.context?.state === 'running') void this.context.suspend().catch(() => { });
      }).catch(() => { });
    } catch { /* Unavailable audio never blocks gameplay; the next gesture can retry. */ }
  }
  setMuted(muted: boolean): void { if (this.muted !== muted) { this.muted = muted; this.applyVolumes(); } }
  setVolumes(music: number, effects: number, ambience: number = this.ambientVolume): void {
    const clamp = (v: number) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    const m = clamp(music), e = clamp(effects), a = clamp(ambience);
    if (m === this.musicVolume && e === this.effectsVolume && a === this.ambientVolume) return;
    this.musicVolume = m; this.effectsVolume = e; this.ambientVolume = a; this.applyVolumes();
  }
  setQuiet(quiet: number): void {
    if (quiet === this.quiet) return;
    this.quiet = Math.min(1, Math.max(0, quiet)); this.applyVolumes();
  }
  private applyVolumes(immediate = false): void {
    if (!this.context) return;
    for (const [bus, value] of [[this.master, this.muted ? 0 : .85], [this.musicBus, this.musicVolume],
    [this.effectsBus, this.effectsVolume], [this.ambientBus, this.ambientVolume * (1 - this.quiet * .6)]] as const) {
      if (!bus) continue;
      if (immediate) bus.gain.value = value;
      else bus.gain.setTargetAtTime(value, this.context.currentTime, .045);
    }
  }
  pause(keepFinale = false, keepImpactTail = false): void {
    if (keepFinale || this.paused) return;
    if (keepImpactTail && this.context && this.context.currentTime < this.effectTailUntil) return;
    this.paused = true; this.music?.pause(); this.effectRevision++;
    for (const source of this.voices) { try { source.stop(); } catch { /* Already ended. */ } }
    if (this.context?.state === 'running') void this.context.suspend().then(() => {
      // A user can resume before the asynchronous suspension has completed.
      if (!this.paused && !this.disposed) void this.context?.resume().catch(() => { });
    }).catch(() => { });
  }
  beginRun(): void {
    this.effectTailUntil = 0;
    this.pause(); this.music?.stop(); this.ambience?.dispose();
    this.scene = ''; this.setScene('runner-intro');
  }
  endRun(): void {
    // Stop loops immediately, but let the final impact finish before suspension.
    this.music?.stop(); this.ambience?.dispose();
    this.effectTailUntil = (this.context?.currentTime ?? 0) + 1.2;
  }
  setScene(scene: string): void {
    if (this.scene === scene) return;
    this.scene = scene; this.effectRevision++;
    this.sceneSelectedAt = this.context?.currentTime ?? 0;
    this.lastMusicPosition = undefined; this.lastMusicAdvanceAt = this.sceneSelectedAt;
    for (const source of this.voices) { try { source.stop(); } catch { /* Already ended. */ } }
    this.lastEffect.clear(); this.selectScene();
    if (scene === 'runner-autumn') this.music?.seek(MUSIC.autumn, AUTUMN_SCORE.musicLeadSeconds);

    const selected = soundscape(this.scene);
    if (selected.music === 'stars') this.music?.seek(MUSIC.stars, SHADOWS_SCORE.musicStartSeconds);
  }

  private selectScene(): void {
    const selected = soundscape(this.scene);
    const file = selected.music === 'ending' && this.finaleOverride ? this.finaleOverride : MUSIC[selected.music];
    const start = this.scene === 'runner-autumn' ? AUTUMN_SCORE.musicLeadSeconds : this.scene === 'pipe-exit' ? AUTUMN_SCORE.musicStartSeconds :
      selected.music === 'shadows' || selected.music === 'stars' ? SHADOWS_SCORE.musicStartSeconds : 0;
    if (selected.music === 'autumn' && this.autumnClock) this.music?.select(file, start, this.autumnClock);
    else this.music?.select(file, start);
    void this.ambience?.select(AMBIENCE[selected.ambience]);
  }
  /** A retry gets a fresh media element, loop counter and clock, even for the same cue. */
  restartMusic(): void {
    this.music?.stop();
    this.sceneSelectedAt = this.context?.currentTime ?? 0;
    this.lastMusicPosition = undefined; this.lastMusicAdvanceAt = this.sceneSelectedAt;
    this.selectScene();
  }
  async effect(name: Effect, strength = 1): Promise<void> {
    if (!this.context || !this.library || !this.effectsBus || this.paused || this.muted || this.disposed) return;
    const now = this.context.currentTime;
    if (this.activeEffects.has(name) || this.pendingEffects.has(name) ||
      now - (this.lastEffect.get(name) ?? -Infinity) < (name === 'star' ? AUDIO.starCooldown : AUDIO.effectCooldown)) return;
    this.lastEffect.set(name, now);
    this.pendingEffects.add(name);
    const revision = this.effectRevision;
    try {
      const file = EFFECTS[name], buffer = await this.library.load(file);
      if (revision !== this.effectRevision || this.paused || this.muted || this.disposed || this.voices.size >= AUDIO.maxEffects) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = file.gain * Math.min(1, Math.max(0, strength));
      source.connect(gain).connect(AMBIENT_EFFECTS.has(name) ? this.ambientBus! : this.effectsBus);
      this.voices.add(source); this.activeEffects.add(name);
      source.onended = () => { this.voices.delete(source); this.activeEffects.delete(name); source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { /* Missing files are reported in status; never replace them with a beep. */ }
    finally { this.pendingEffects.delete(name); }
  }
  roomEvent(event: RoomEvent): void {
    if (event === 'look') return;
    void this.effect(({ flicker: 'neon', clock: 'clock', door: 'door' } as const)[event]);
  }
  collect(): void { void this.effect('cassette'); }
  /** A playing track drives rhythm; unavailable audio falls back after a short grace period. */
  musicPosition(scene: MusicScene): number | undefined {
    if (!this.context || this.paused) return undefined;
    const voice = this.music?.status.find(v => MUSIC[scene].urls.includes(v.url) && !v.fading);
    if (voice) {
      const position = voice.elapsed ?? voice.position;
      if (this.lastMusicPosition === undefined || position > this.lastMusicPosition + .0001) {
        this.lastMusicPosition = position; this.lastMusicAdvanceAt = this.context.currentTime;
      }
      return this.context.currentTime - this.lastMusicAdvanceAt > 3 ? undefined : position;
    }
    if (this.errors.size || this.context.currentTime - this.sceneSelectedAt > 3) return undefined;
    return 0;
  }
  /** Read-only mixer diagnostics, also used by browser verification. */
  get status() {
    return {
      state: this.context?.state ?? 'locked', time: this.context?.currentTime ?? 0,
      paused: this.paused, muted: this.muted, scene: this.scene,
      musicVolume: this.musicBus?.gain.value ?? this.musicVolume, effectsVolume: this.effectsBus?.gain.value ?? this.effectsVolume,
      ambientVolume: this.ambientBus?.gain.value ?? this.ambientVolume,
      master: this.master?.gain.value ?? 0, music: this.music?.status ?? [], ambience: this.ambience?.status ?? [],
      effects: this.voices.size, errors: [...this.errors]
    };
  }
  dispose(): void {
    this.autumnClock = undefined;
    this.disposed = true; this.pause(); this.effectRevision++;
    this.music?.dispose(); this.ambience?.dispose(); this.library?.dispose();
    void this.context?.close().catch(() => { });
  }
}
