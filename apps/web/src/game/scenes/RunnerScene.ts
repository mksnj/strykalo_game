import Phaser from 'phaser';
import { RUNNER as C, JOURNEY, STORM } from '../config';
import { loadAssets } from '../assets/load';
import { RunSession, type JourneyPhase } from '../state/RunSession';
import { gameStore } from '../state/store';
import { RunnerInput } from '../input/RunnerInput';
import { BalanceInput, balanceControls } from '../input/BalanceInput';
import { AudioManager } from '../audio/AudioManager';
import { GameplaySoundscape } from '../audio/GameplaySoundscape';
import { autumnMusicTime, autumnStepBudget, musicCue } from '../audio/catalog';
import { RunnerView } from '../views/RunnerView';
import { PipeView } from '../views/PipeView';
import { StarsView } from '../views/StarsView';
import { WaitingView } from '../views/WaitingView';
import { EndingView } from '../views/EndingView';
import { JourneyInput, rhythmControls } from '../input/JourneyInput';
import { ArrivalView } from '../views/ArrivalView';
import { ARRIVAL, courtArrival, courtDeparture, roomArrival, roomEntry, smooth } from '../views/arrivalLayout';
import { finalQuiet, finalArrival, pipeTurn } from '../views/worldLayout';
import { layoutCamera } from '../viewport';
import { coverScenery } from '../views/sceneryWings';
import { StormView } from '../views/StormView';

export class RunnerScene extends Phaser.Scene {
  private session?: RunSession;
  private runnerView!: RunnerView;
  private pipeView!: PipeView;
  private starsView!: StarsView;
  private waitingView!: WaitingView;
  private endingView!: EndingView;
  private arrivalView!: ArrivalView;
  private stormView!: StormView;
  private cutShade!: Phaser.GameObjects.Rectangle;
  private inputController?: RunnerInput;
  private balanceInput?: BalanceInput;
  private journeyInput?: JourneyInput;
  private audio = new AudioManager();
  private soundscape = new GameplaySoundscape(this.audio);
  private unlockAudio = () => {
    const state = gameStore.getSnapshot();
    if (this.enabled() || state.screen === 'completed' && !document.hidden) this.audio.unlock();
  };
  private accumulator = 0;
  private runNumber = 0;
  private continueNumber = 0;
  private balanceStartNumber = 0;
  private starsStartNumber = 0;
  private starsGateNumber = 0;
  private starsRound = 0;
  private visualTime = 0;
  private menuTravel = 0;
  private wasEnabled = false;
  private lastPhase: JourneyPhase = 'runner';
  private unsubscribe?: () => void;
  private suspendAudio = () => { this.clearInput(); this.audio.pause(); };
  private visibility = () => { if (document.hidden) this.suspendAudio(); };
  constructor() { super('runner'); this.audio.followAutumn(() => autumnMusicTime(this.session)); }
  preload(): void {
    this.load.on('loaderror', () => gameStore.fail('Не удалось загрузить рисунки. Проверьте соединение и обновите страницу.'));
    loadAssets(this);
  }
  create(): void {
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
    window.addEventListener('click', this.unlockAudio);
    window.addEventListener('blur', this.suspendAudio);
    window.addEventListener('pagehide', this.suspendAudio);
    document.addEventListener('visibilitychange', this.visibility);
    this.cameras.main.setBackgroundColor('#222b39');
    this.runnerView = new RunnerView(this);
    this.pipeView = new PipeView(this);
    this.starsView = new StarsView(this, this.runnerView.hero);
    this.waitingView = new WaitingView(this);
    this.endingView = new EndingView(this);
    this.arrivalView = new ArrivalView(this, this.runnerView.hero);
    this.stormView = new StormView(this);
    this.cutShade = this.add.rectangle(480, 270, 960, 540, 0x111822).setDepth(110).setAlpha(0);
    const surface = this.game.canvas.closest<HTMLElement>('.app') ?? this.game.canvas;
    this.inputController = new RunnerInput(surface, () => this.session,
      () => this.enabled() && this.session?.phase === 'runner', () => this.audio.unlock());
    this.balanceInput = new BalanceInput(() => this.enabled() && this.session?.phase === 'balance', surface, () => this.audio.unlock());
    this.journeyInput = new JourneyInput(surface, () => {
      if (!this.enabled()) return undefined;
      const phase = this.session?.phase;
      return phase === 'stars' || phase === 'waiting' ? phase : undefined;
    }, () => this.session?.gameplayInput(), () => this.audio.unlock(), event => {
      const rect = this.game.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * this.scale.width / rect.width;
      const y = (event.clientY - rect.top) * this.scale.height / rect.height;
      const point = this.cameras.main.getWorldPoint(x, y);
      return this.waitingView.interact(point.x, point.y);
    });
    this.unsubscribe = gameStore.subscribe(() => {
      const state = gameStore.getSnapshot();
      if (state.paused || state.balanceIntroOpen || state.starsIntroOpen || state.screen === 'menu') { this.clearInput(); this.audio.pause(); }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
    gameStore.ready();
  }
  private enabled(): boolean {
    const state = gameStore.getSnapshot();
    return state.screen === 'playing' && !state.paused && !state.balanceIntroOpen && !state.starsIntroOpen &&
      this.session?.phase !== 'stars-locked' &&
      !this.session?.balanceIntroPending && !this.session?.starsIntroPending && !document.hidden;
  }
  update(time: number, delta: number): void {
    const state = gameStore.getSnapshot();
    if (state.screen === 'menu' && !document.hidden) this.menuTravel += Math.min(delta, 50) * 0.009;
    this.audio.setMuted(state.muted);
    this.audio.setVolumes(state.musicVolume, state.effectsVolume, state.ambientVolume);
    this.audio.setQuiet(this.session?.phase === 'final-run' || this.session?.phase === 'ending' ? finalQuiet(this.session.runner.artDistance) : 0);
    if (state.runNumber !== this.runNumber && state.screen === 'playing') {
      this.clearInput();
      this.session = new RunSession(state.seed, state.developer, state.debugStart, undefined, state.bypassStarsGate);
      this.runNumber = state.runNumber;
      this.accumulator = 0; this.visualTime = 0; this.lastPhase = 'runner';
      this.runnerView.reset();
      this.soundscape.reset();
      this.audio.beginRun();
      this.audio.setScene(musicCue(this.session));
      this.starsRound = this.session.starsRound;
      gameStore.progress(this.session);
    }
    if (state.continueNumber !== this.continueNumber) {
      this.continueNumber = state.continueNumber;
      if (this.session?.continueFromCheckpoint()) {
        this.clearInput(); this.accumulator = 0; this.visualTime = 0;
        this.lastPhase = this.session.phase; this.runnerView.reset(); this.soundscape.reset();
        this.audio.beginRun(); this.audio.setScene(musicCue(this.session));
        gameStore.progress(this.session);
      }
    }
    if (state.balanceStartNumber !== this.balanceStartNumber) {
      this.balanceStartNumber = state.balanceStartNumber;
      this.clearInput(); this.accumulator = 0; this.session?.startBalance();
    }
    if (state.starsStartNumber !== this.starsStartNumber) {
      this.starsStartNumber = state.starsStartNumber;
      this.clearInput(); this.accumulator = 0;
      if (this.session?.startStars()) this.audio.setScene(musicCue(this.session));
    }
    if (state.starsGateNumber !== this.starsGateNumber) {
      this.starsGateNumber = state.starsGateNumber;
      if (this.session?.resolveStarsGate(state.starsGateAction)) {
        this.clearInput(); this.accumulator = 0;
        this.audio.setScene(musicCue(this.session)); gameStore.progress(this.session);
      }
    }
    // Release-date polling also works while the gate has paused the simulation or the tab was hidden.
    if (state.screen === 'playing' && this.session?.refreshStarsAccess()) gameStore.progress(this.session);
    this.syncStarsRound();
    const enabled = this.enabled();
    if (!enabled) {
      this.accumulator = 0;
      this.clearInput();
      this.audio.pause(state.screen === 'completed' && !document.hidden,
        state.screen === 'game-over' && !document.hidden);
    } else if (!this.wasEnabled) this.audio.unlock();
    this.wasEnabled = enabled;
    if (enabled && this.session) {
      const previousScore = this.session.score;
      const previousLives = this.session.lives;
      const scoreBudget = autumnMusicTime(this.session) === undefined ? undefined :
        autumnStepBudget(this.session, this.audio.musicPosition('autumn'));
      if (scoreBudget === undefined) this.accumulator += Math.min(delta / 1000, 0.05);
      else this.accumulator = scoreBudget;
      while (this.accumulator >= C.fixedStep && !this.session.result) {
        for (const direction of rhythmControls.drain()) this.session.rhythmPress(direction);
        this.session.step(this.session.phase === 'balance' ? balanceControls.direction : 0, 0, this.journeyInput?.held,
          this.session.phase === 'stars' ? this.audio.musicPosition('stars') : undefined);
        this.soundscape.step(this.session);
        for (const event of this.session.waiting?.drainEvents() ?? []) if (event !== 'door') this.audio.roomEvent(event);
        this.accumulator -= C.fixedStep;

        if (this.lastPhase !== this.session.phase) {
          this.clearInput();
          this.lastPhase = this.session.phase;
          const nextCue = musicCue(this.session);
          this.audio.setScene(nextCue);
        }
        this.syncStarsRound();
        if (this.session.balanceIntroPending || this.session.starsIntroPending || this.session.phase === 'stars-locked') { this.accumulator = 0; break; }
      }
      const gait = this.session.phase === 'runner' || this.session.phase === 'final-run' ? this.session.runner.speed / C.speed :
        this.session.phase === 'pipe-approach' ? Math.max(0, 1 - this.session.transitionProgress) * 0.4 : 1;
      this.visualTime += Math.min(delta, 50) * gait;
      this.soundscape.light(this.session, this.visualTime);
      if (this.session.score > previousScore) this.audio.collect();
      if (this.session.lives < previousLives && this.session.phase === 'runner') this.cameras.main.shake(160, 0.004);
      gameStore.progress(this.session);
      if (this.session.result) {
        if (this.session.result.reason !== 'completed') this.audio.endRun();
        gameStore.finish(this.session.result);
      }
    }
    this.renderWorld(time);
  }
  private renderWorld(time: number): void {
    const state = gameStore.getSnapshot();
    const session = this.session;
    const menu = state.screen === 'menu';
    const phase = session?.phase ?? 'runner';
    const progress = Phaser.Math.Clamp(session?.transitionProgress ?? 0, 0, 1);
    layoutCamera(this.cameras.main, this.scale.width === 720, menu ? 'runner' : phase, progress);
    const eased = progress * progress * (3 - 2 * progress);
    const pipeApproach = !menu && phase === 'pipe-approach';
    const pipeAlpha = menu ? 0 : pipeApproach ? pipeTurn(progress) : phase === 'balance' ? 1 : phase === 'pipe-exit' ? 1 - smooth(progress) : 0;
    coverScenery(this.cutShade);
    this.cutShade.setAlpha(0);
    const courtApproach = !menu && phase === 'stars-approach';
    const roomApproach = !menu && phase === 'room-approach';
    const arrival = courtApproach || roomApproach;
    const onward = courtApproach ? ARRIVAL.offset - courtArrival(progress, session?.route.scale).offset : roomApproach ? roomArrival(progress).camera :
      session && (phase === 'final-run' || phase === 'ending') ? -finalArrival(session.runner.artDistance, session.route.scale).advance : 0;
    const starsExit = !menu && phase === 'stars-exit';
    const inCourt = !menu && (phase === 'stars' || phase === 'stars-locked' || phase === 'stars-retry' || phase === 'stars-failure' || starsExit);
    const courtCamera = inCourt ? starsExit ? courtDeparture(progress, session?.stars?.x ?? ARRIVAL.courtX,
      session?.stars?.y ?? ARRIVAL.courtY).camera : 0 : undefined;
    this.runnerView.render(session?.runner, this.visualTime, time, menu ? this.menuTravel : undefined,
      pipeApproach ? progress : 0, onward, menu || !arrival && (phase === 'runner' || phase === 'beer-pickup' || phase === 'pipe-exit' || pipeApproach && progress <= .36),
      courtCamera);
    this.runnerView.renderBeer(session?.runner, !menu && (phase === 'runner' || phase === 'beer-pickup') && session?.region === 'night',
      phase === 'beer-pickup', phase === 'beer-pickup' ? session?.phaseTime ?? 0 : 0, session?.beerCollected ?? false);
    const starsAlpha = inCourt ? 1 : 0;
    const roomAlpha = menu ? 0 : roomApproach ? Number(progress >= ARRIVAL.roomCut) :
      phase === 'waiting' || phase === 'room-rest' || phase === 'room-exit' ? 1 : 0;
    const ending = !menu && (phase === 'final-run' || phase === 'ending');
    this.runnerView.container.setVisible(inCourt || (pipeAlpha < 1 && starsAlpha < 1 && (roomAlpha < 1 || roomApproach)));
    this.pipeView.render(session?.balance, pipeAlpha, session?.phaseTime ?? 0, session?.result?.reason === 'fall',
      pipeApproach ? 'approach' : phase === 'pipe-exit' ? 'exit' : 'balance',
      (session?.route.balanceAt ?? 200) * C.pixelsPerUnit);
    this.starsView.render(session?.stars, starsAlpha, phase === 'stars-failure' || phase === 'stars-retry' ? Math.max(C.fixedStep, session?.phaseTime ?? 0) : starsExit ? JOURNEY.narrativeSeconds : 0,
      (session?.route.starsAt ?? JOURNEY.starsAt) * C.pixelsPerUnit + ARRIVAL.offset, session?.route.scale ?? 1,
      starsExit ? progress : 0, this.visualTime);
    if (courtApproach) {
      this.starsView.renderArrival(0, progress, this.visualTime, session?.runner.player.y, session?.route.scale);
    }
    const clearing = phase === 'room-rest';
    const weatherTime = session?.weatherStarted && (!session.weatherCleared || clearing) ? session.weatherElapsed : undefined;
    const weatherStrength = clearing ? 1 - smooth((session?.phaseTime ?? 0) / STORM.clearSeconds) : 1;
    this.waitingView.render(session?.waiting, roomAlpha, phase === 'room-exit' ? eased : 0,
      roomApproach ? roomEntry(progress) : 1, this.visualTime, weatherTime, weatherStrength);
    this.endingView.render(session, ending, this.visualTime);
    this.arrivalView.render(session, this.visualTime, menu);
    this.stormView.render(!menu && !!session?.weatherStarted && !session.weatherCleared &&
      (phase === 'runner' || roomApproach && progress < ARRIVAL.roomCut), session?.weatherElapsed ?? 0);
  }
  private clearInput(): void {
    this.inputController?.clear(); this.balanceInput?.clear(); this.journeyInput?.clear();
    rhythmControls.clear();
  }
  private syncStarsRound(): void {
    if (!this.session || this.starsRound === this.session.starsRound) return;
    this.starsRound = this.session.starsRound;
    this.clearInput();
    this.audio.setScene(musicCue(this.session));
    this.audio.restartMusic();
  }
  private dispose(): void {
    this.unsubscribe?.();
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    window.removeEventListener('click', this.unlockAudio);
    window.removeEventListener('blur', this.suspendAudio);
    window.removeEventListener('pagehide', this.suspendAudio);
    document.removeEventListener('visibilitychange', this.visibility);
    this.inputController?.dispose(); this.balanceInput?.dispose();
    this.journeyInput?.dispose();
    this.audio.dispose(); this.starsView.dispose(); this.runnerView.dispose(); this.pipeView.dispose();
    this.waitingView.dispose(); this.endingView.dispose(); this.arrivalView.dispose(); this.stormView.dispose();
  }
}
