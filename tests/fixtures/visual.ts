// Isolated renderer fixture: never included in the production application's entry point.
import Phaser from 'phaser';
import { loadAssets } from '../../apps/web/src/game/assets/load';
import { PipeView } from '../../apps/web/src/game/views/PipeView';
import { WaitingView } from '../../apps/web/src/game/views/WaitingView';
import { StarsView } from '../../apps/web/src/game/views/StarsView';
import { RunnerView } from '../../apps/web/src/game/views/RunnerView';
import { ArrivalView } from '../../apps/web/src/game/views/ArrivalView';
import { EndingView } from '../../apps/web/src/game/views/EndingView';
import { WaitingEngine } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';
import { BalanceEngine } from '../../apps/web/src/game/minigames/balance/BalanceEngine';
import { StarsEngine } from '../../apps/web/src/game/minigames/stars/StarsEngine';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { JOURNEY, RUNNER } from '../../apps/web/src/game/config';
import { ARRIVAL, courtArrival, roomArrival, roomEntry, roomTransition } from '../../apps/web/src/game/views/arrivalLayout';
import { pipeTurn } from '../../apps/web/src/game/views/worldLayout';
import { ASSETS } from '../../apps/web/src/game/assets/manifest';
import { starsPilot } from './starsPilot';
import { layoutCamera } from '../../apps/web/src/game/viewport';

class Preview extends Phaser.Scene {
  preload() { loadAssets(this); }
  create() {
    const runner = new RunnerView(this), pipe = new PipeView(this), stars = new StarsView(this, runner.hero);
    const room = new WaitingView(this), ending = new EndingView(this), arrival = new ArrivalView(this);
    let waiting = new WaitingEngine();
    const show = (name: string, value: number, reset = false, visualTime = 1000) => {
      layoutCamera(this.cameras.main, false, 'runner');
      if (reset) runner.reset();
      for (const view of [runner, pipe, stars, room, ending, arrival]) view.container.setVisible(false);
      runner.hero.setVisible(false);
      stars.render(undefined, 0);
      // Clear the transition shade as well as its container.
      arrival.render(undefined, 0, true);
      if (name === 'pipe-entry') {
        const engine = new RunnerEngine(1, { start: 0, end: 200, score: 0, empty: true });
        engine.travel = 200 * RUNNER.pixelsPerUnit;
        runner.container.setVisible(true); runner.render(engine, value * 1000, 0, undefined, value, 0, value <= .36);
        pipe.render(undefined, pipeTurn(value), value * JOURNEY.approachSeconds, false, 'approach');
      } else if (name === 'crossing-dev') {
        const session = new RunSession(1, true);
        session.runner.travel = value * RUNNER.pixelsPerUnit;
        runner.container.setVisible(true); runner.render(session.runner, visualTime, 0);
      } else if (name === 'pipe') {
        const engine = new BalanceEngine(1); engine.elapsed = value; engine.position = .08;
        pipe.render(engine, 1, 0, false);
      } else if (name === 'room') {
        if (reset) waiting.gameplayInput();
        for (let i = 0; i < Math.round(value / RUNNER.fixedStep); i++) waiting.step();
        room.render(waiting, 1, 0, 1, waiting.activeTime * 1000);
      } else if (name === 'shower') {
        layoutCamera(this.cameras.main, false, 'stars');
        const engine = new StarsEngine(1);
        for (let i = 0; i < value / RUNNER.fixedStep && !engine.outcome; i++) {
          starsPilot(engine); engine.step();
        }
        const street = new RunnerEngine(1, { start: JOURNEY.balanceAt, end: JOURNEY.starsAt, score: 0, empty: true });
        street.travel = JOURNEY.starsAt * RUNNER.pixelsPerUnit;
        runner.container.setVisible(true); runner.render(street, visualTime, 0, undefined, 0, 0, false, 0);
        stars.render(engine, 1);
      } else if (name === 'court' || name === 'court-dev' || name === 'stars-start' || name === 'stars-start-dev') {
        const session = new RunSession(1, name.endsWith('-dev'));
        session.runner = new RunnerEngine(1, { start: session.route.balanceAt, end: session.route.starsAt, score: 0,
          empty: true, distanceScale: session.route.scale });
        session.runner.travel = (session.route.starsAt - (value < 0 ? 5 / session.route.scale : 0)) * RUNNER.pixelsPerUnit;
        if (value >= 0) { session.phase = 'stars-approach'; session.phaseTime = value * JOURNEY.courtApproachSeconds; }
        layoutCamera(this.cameras.main, false, session.phase, value);
        const offset = value >= 0 ? ARRIVAL.offset - courtArrival(value).offset : 0;
        runner.container.setVisible(true); runner.render(session.runner, value * 3000, 0, undefined, 0, offset, value < 0);
        arrival.render(session, value * 3000, false);
        const courtOffset = value >= 0 ? courtArrival(value).offset : ARRIVAL.offset + 300;
        stars.renderArrival(courtOffset, value >= 0 ? value : undefined, value * 3000);
        if (name.startsWith('stars-start')) {
          arrival.render(undefined, 0, true);
          layoutCamera(this.cameras.main, false, 'stars');
          runner.render(session.runner, value * 3000, 0, undefined, 0, 0, false, 0);
          runner.hero.setVisible(false);
          stars.render(new StarsEngine(1), 1, 0, session.runner.travel + ARRIVAL.offset, session.route.scale, 0, value * 3000);
        }
      } else if (name === 'room-entry') {
        const session = new RunSession(1);
        session.runner = new RunnerEngine(1, { start: JOURNEY.starsAt, end: JOURNEY.waitingAt, score: 0, empty: true });
        session.runner.travel = JOURNEY.waitingAt * RUNNER.pixelsPerUnit;
        session.phase = 'room-approach'; session.phaseTime = value * JOURNEY.roomApproachSeconds;
        runner.container.setVisible(true); runner.render(session.runner, value * 7200, 0, undefined, 0, roomArrival(value).camera, false);
        room.render(undefined, Number(roomTransition(value).interior), 0, roomEntry(value), value * 7200);
        arrival.render(session, value * 7200, false);
      } else if (name === 'final') {
        const session = new RunSession(1);
        session.runner = new RunnerEngine(1, { start: JOURNEY.waitingAt, end: JOURNEY.availableEnd, score: 0, empty: true });
        session.runner.travel = Math.min(JOURNEY.availableEnd, value) * 60;
        session.phase = value > JOURNEY.availableEnd ? 'ending' : 'final-run';
        session.phaseTime = Math.max(0, value - JOURNEY.availableEnd);
        runner.container.setVisible(true); runner.render(session.runner, 1200, 0, undefined, 0, -Math.max(0, (Math.min(value, JOURNEY.availableEnd) - (JOURNEY.availableEnd - 6)) * 60), false);
        ending.render(session, true, 1200);
      } else if (name === 'shadows' || name === 'shadow-jump') {
        const engine = new RunnerEngine(1, { start: JOURNEY.starsAt, end: JOURNEY.waitingAt, score: 0, empty: true });
        engine.travel = value * RUNNER.pixelsPerUnit;
        runner.reset(); runner.container.setVisible(true);
        // Establish actual delayed samples, then render the present frame.
        for (let i = 0; i < 50; i++) {
          engine.player.y = name === 'shadow-jump' && i < 35 ? RUNNER.groundY - 65 : RUNNER.groundY;
          engine.player.grounded = engine.player.y === RUNNER.groundY;
          runner.render(engine, 1000 + i * 10, 0);
        }
      } else {
        const start = name === 'television' ? 0 : name === 'crossing' ? value > 200 ? 200 : 0 : 200;
        const engine = new RunnerEngine(1, { start, end: start ? JOURNEY.starsAt : JOURNEY.balanceAt, score: 0, empty: true });
        engine.travel = Math.min(value, JOURNEY.starsAt) * 60;
        runner.container.setVisible(true); runner.render(engine, visualTime, 0);
      }
    };
    const auditTextures = async () => {
      const textures = await Promise.all(ASSETS.map(async asset => {
        const texture = this.textures.get(asset.key), source = texture.source[0];
        const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
        const context = canvas.getContext('2d')!; context.drawImage(source.image as CanvasImageSource, 0, 0);
        const pixels = context.getImageData(0, 0, source.width, source.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        const pixelSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        // A newly created image must select the intended default even after all views exist.
        const probe = this.make.image({ key: asset.key, add: false });
        const defaultFrame = { name: String(probe.frame.name), width: probe.frame.width, height: probe.frame.height };
        probe.destroy();
        return { key: texture.key, url: asset.url, decodedSourceUrl: (source.image as HTMLImageElement).src,
          pixelSha256, width: source.width, height: source.height,
          firstFrame: String(texture.firstFrame), defaultFrame,
          frames: texture.getFrameNames().map(name => {
            const frame = texture.get(name);
            return { name: String(name), x: frame.cutX, y: frame.cutY, width: frame.cutWidth, height: frame.cutHeight };
          }) };
      }));
      const objects: { type: string; key: string; frame: string }[] = [];
      const visit = (list: Phaser.GameObjects.GameObject[]) => list.forEach(object => {
        if (object instanceof Phaser.GameObjects.Container) visit(object.list);
        if (object instanceof Phaser.GameObjects.Image || object instanceof Phaser.GameObjects.Sprite || object instanceof Phaser.GameObjects.TileSprite) {
          // TileSprite.texture is a generated repeat canvas; displayTexture is the selected asset.
          // Phaser 3's declarations omit these two runtime TileSprite properties.
          const tile = object as Phaser.GameObjects.TileSprite & { displayTexture: Phaser.Textures.Texture; displayFrame: Phaser.Textures.Frame };
          const texture = object instanceof Phaser.GameObjects.TileSprite ? tile.displayTexture : object.texture;
          const frame = object instanceof Phaser.GameObjects.TileSprite ? tile.displayFrame : object.frame;
          objects.push({ type: object.type, key: texture.key, frame: String(frame.name) });
        }
      });
      visit(this.children.list);
      const runtimeTextures = ['room-painted-graffiti'].map(key => {
        const texture = this.textures.get(key);
        return { key, width: texture.source[0].width, height: texture.source[0].height };
      });
      return { textures, objects, runtimeTextures };
    };
    const auditTextureSwitches = () => {
      const prototype = Phaser.GameObjects.TileSprite.prototype, original = prototype.setTexture;
      const switches: string[] = [];
      prototype.setTexture = function(key, frame) { switches.push(String(key)); return original.call(this, key, frame); };
      try {
        for (let i = 0; i < 30; i++) show('memory', 325);
        for (let i = 0; i < 30; i++) show('shadows', 715);
        for (let i = 0; i < 30; i++) show('memory', 325);
      } finally { prototype.setTexture = original; }
      return switches;
    };
    const resizePanorama = (width: number) => {
      this.scale.resize(width, 540);
      this.cameras.main.setSize(width, 540).setScroll((960 - width) / 2, 0);
    };
    const auditPanorama = (name: string) => {
      const view = name === 'pipe' ? pipe : room;
      const images: Phaser.GameObjects.Image[] = [];
      const visit = (container: Phaser.GameObjects.Container) => {
        for (const object of container.list) {
          if (object instanceof Phaser.GameObjects.Container) visit(object);
          if (object instanceof Phaser.GameObjects.Image &&
            ['pipe-sunset', 'waiting-room'].includes(object.texture.key)) images.push(object);
        }
      };
      visit(view.container);
      return images.map(image => {
        const bounds = image.getBounds();
        return { key: image.texture.key, left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
          flipX: image.flipX, flipY: image.flipY, scaleX: image.scaleX, scaleY: image.scaleY };
      });
    };
    const auditLayers = () => {
      const art = (runner as any).nightArt, crossing = (runner as any).crossing;
      const echo = (runner as any).shadows.echo;
      const televisionBounds = (runner as any).television.container.getBounds();
      return { crossing: crossing.container.visible, groundMask: !!art.ground.mask,
        midgroundMask: !!art.midground.mask, farMask: !!art.far.mask,
        pipe: { x: crossing.pipe.x, right: crossing.pipe.x + crossing.pipe.displayWidth },
        excavation: { x: crossing.excavation.x, right: crossing.excavation.x + crossing.excavation.displayWidth },
        television: { x: (runner as any).television.container.x, visible: (runner as any).television.container.visible,
          y: (runner as any).television.container.y, bodyY: (runner as any).television.body.y,
          bodyVisible: (runner as any).television.body.visible,
          cropHeight: (runner as any).television.body._crop.height,
          courtyardTravel: art.court.tilePositionX * art.court.tileScaleX,
          waterBottom: (runner as any).television.container.list[0].getBounds().bottom,
          behindGround: runner.container.getIndex((runner as any).television.container) < runner.container.getIndex(runner.groundLayer),
          textures: (runner as any).television.container.list.map((image: any) => image.texture.key),
          bounds: { x: televisionBounds.x, y: televisionBounds.y, width: televisionBounds.width,
            height: televisionBounds.height, bottom: televisionBounds.bottom } },
        shadow: { x: echo.x, y: echo.y, width: echo.displayWidth, height: echo.displayHeight,
          rotation: echo.rotation, flipY: echo.flipY, alpha: echo.alpha,
          visible: (runner as any).shadows.container.visible, count: (runner as any).shadows.container.list.length },
        wings: (ending as any).wings.map((wing: any) => ({ frame: wing.displayFrame.name,
          width: wing.width, x: wing.x, flipX: wing.flipX,
          crop: { x: wing.displayFrame.cutX, y: wing.displayFrame.cutY, width: wing.displayFrame.cutWidth, height: wing.displayFrame.cutHeight } })),
      };
    };
    const setMidgroundVisible = (visible: boolean) => (runner as any).nightArt.midground.setVisible(visible);
    const setForegroundMaskEnabled = (enabled: boolean) => {
      const art = (runner as any).nightArt;
      if (enabled) art.foreground.setMask((runner as any).crossing.frontMask);
      else art.foreground.clearMask(false);
    };
    const auditFarJoin = () => {
      const pixels = (key: string) => {
        const source = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(source, 0, 0);
        return { width: source.width, data: ctx.getImageData(0, 0, source.width, source.height).data };
      };
      const source = pixels('night-far'), repeat = pixels('night-far-repeat');
      const columnDifference = (image: typeof source, a: number, b: number) => {
        let error = 0;
        for (let y = 0; y < 224; y++) for (let c = 0; c < 3; c++) {
          error += Math.abs(image.data[(y * image.width + a) * 4 + c] - image.data[(y * image.width + b) * 4 + c]);
        }
        return error / (224 * 3);
      };
      let changedInterior = 0;
      for (let y = 0; y < 512; y += 8) for (let x = 0; x < repeat.width - 128; x += 8) {
        for (let c = 0; c < 4; c++) if (source.data[(y * source.width + x + 128) * 4 + c] !==
          repeat.data[(y * repeat.width + x) * 4 + c]) changedInterior++;
      }
      return { before: columnDifference(source, 0, source.width - 1),
        after: columnDifference(repeat, 0, repeat.width - 1),
        reference: columnDifference(source, 127, 128), changedInterior };
    };
    const auditCourtPose = () => ({ x: runner.hero.x, y: runner.hero.y, size: runner.hero.displayHeight,
      camera: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY, zoom: this.cameras.main.zoom } });
    Object.assign(window, { scenePreview: { show, auditTextures, auditFarJoin, auditTextureSwitches, resizePanorama, auditPanorama, auditCourtPose,
      auditLayers, setMidgroundVisible, setForegroundMaskEnabled } });
  }
}
new Phaser.Game({ type: Phaser.AUTO, width: 960, height: 540, backgroundColor: '#222b39',
  scene: [Preview], audio: { noAudio: true }, render: { antialias: true, pixelArt: false } });
