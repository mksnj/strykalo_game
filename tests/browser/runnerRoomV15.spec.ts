import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';

const directory = 'docs/previews/runner-room-v15';
async function captureRoomLight(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).rhythmScene;
    const room=s.waitingView.composition,cam=s.cameras.main;
    const points=[[250,180],[650,300],[480,450]].map(([x,y]) =>
      cam.matrix.transformPoint(room.x+x*room.scaleX-cam.scrollX,room.y+y*room.scaleY-cam.scrollY));
    (window as any).roomPixels = undefined;
    s.game.renderer.snapshot((image: HTMLImageElement) => {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      (window as any).roomPixels = points.map(({x,y}: {x:number;y:number}) => {
        const pixels = ctx.getImageData(Math.floor(x), Math.floor(y), 5, 5).data;
        let brightness = 0;
        for (let i = 0; i < pixels.length; i += 4) brightness += pixels[i] + pixels[i+1] + pixels[i+2];
        return brightness / 75;
      });
    });
  });
  await page.clock.runFor(40);
  await page.waitForFunction(() => !!(window as any).roomPixels);
  return page.evaluate(() => (window as any).roomPixels as number[]);
}

for (const [width,height,name] of [[960,540,'desktop'],[390,844,'portrait'],[1230,372,'wide']] as const) {
  test('city and asphalt throughout runner, whole-room lamp and quiet ending: ' + name, async ({page}) => {
    test.setTimeout(90000); await page.setViewportSize({width,height}); await bootRhythm(page, false);
    await mkdir(directory,{recursive:true});
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const route: any[] = [];
    for (const distance of [50,210,350,460,585,598,640,698]) {
      await page.evaluate(async distance => {
        const path='/src/game/runner/engine.ts', {RunnerEngine}=await import(/* @vite-ignore */ path);
        const s=(window as any).rhythmScene.session;
        const start=distance<200?0:distance<400?200:distance<600?400:600;
        s.runner=new RunnerEngine(42,{start,end:start===0?200:start===200?400:start===400?600:700,empty:true});
        s.runner.travel=distance*60; s.phase=start===600?'final-run':'runner'; s.phaseTime=0;
        s.weatherStarted=false; s.weatherCleared=false; s.weatherElapsed=0;
      },distance);
      await page.clock.runFor(40);
      const layers=await page.evaluate(()=>{
        const scene=(window as any).rhythmScene, a=scene.runnerView.nightArt;
        return {road:a.ground.displayTexture.key,visible:a.ground.visible,y:a.ground.y,
          scale:[a.ground.tileScaleX,a.ground.tileScaleY],width:a.ground.width,left:a.ground.x,
          foundation:a.foundation.visible,city:a.far.displayTexture.key,
          entranceCrop:scene.arrivalView.exterior.list[0]._crop.height,
          endingCrop:scene.endingView.architecture.list.find((o:any)=>o.texture?.key==='ending-facade')._crop.height,
          wings:scene.endingView.wings.map((w:any)=>w.height),
          camera:{left:scene.cameras.main.worldView.left,right:scene.cameras.main.worldView.right}};
      });
      expect(layers.road).toBe('night-ground'); expect(layers.visible).toBe(true); expect(layers.foundation).toBe(false);
      expect(layers.y).toBe(435); expect(layers.scale).toEqual([105/164,105/164]);
      expect(layers.left).toBeLessThanOrEqual(layers.camera.left+1);
      expect(layers.left+layers.width).toBeGreaterThanOrEqual(layers.camera.right-1);
      if (distance>200) expect(layers.city).toBe('night-far-court-sky');
      expect(layers.entranceCrop).toBe(435); expect(layers.endingCrop).toBe(435);
      if(distance>600) expect(layers.wings).toEqual([435,435]);
      route.push({distance,...layers});
      await page.screenshot({path:`${directory}/${name}-street-${distance}.png`});
    }
    await page.evaluate(async()=>{
      const path='/src/game/minigames/waiting/WaitingEngine.ts', {WaitingEngine}=await import(/* @vite-ignore */ path);
      const s=(window as any).rhythmScene.session;
      s.phase='waiting';s.phaseTime=0;s.waiting=new WaitingEngine();
      for(let i=0;i<1200;i++)s.waiting.step();
    });
    await page.clock.runFor(40);
    const before=await captureRoomLight(page);
    await page.screenshot({path:`${directory}/${name}-lamp-before.png`});
    const point=await page.evaluate(()=>{
      const s=(window as any).rhythmScene,c=s.waitingView.composition,cam=s.cameras.main;
      const p=cam.matrix.transformPoint(c.x+429*c.scaleX-cam.scrollX,c.y+154*c.scaleY-cam.scrollY);
      const r=s.game.canvas.getBoundingClientRect();
      return{x:r.x+p.x/s.scale.width*r.width,y:r.y+p.y/s.scale.height*r.height};
    });
    await page.mouse.click(point.x,point.y);
    for(let i=0;i<15;i++){
      await page.clock.runFor(20);
      if(await page.evaluate(()=>(window as any).rhythmScene.waitingView.lampResponse.alpha>0))break;
    }
    const debug=()=>page.evaluate(()=>{const s=(window as any).rhythmScene,v=s.waitingView;return {progress:v.reactions.progress('lamp',v.visualTime),time:v.visualTime,alpha:v.lampResponse.alpha,resets:s.session.waiting.resets,bounds:v.lampResponse.getBounds(),camera:s.cameras.main.worldView,canvas:[s.game.canvas.width,s.game.canvas.height],scale:s.cameras.main.zoom};});
    expect((await debug()).alpha,JSON.stringify({point,state:await debug()})).toBeGreaterThan(0);
    const dimmed=await captureRoomLight(page);
    for(let i=0;i<before.length;i++) expect(dimmed[i],JSON.stringify({before,dimmed,state:await debug()})).toBeLessThan(before[i]*.9);
    await page.screenshot({path:`${directory}/${name}-lamp-dimmed.png`});
    for(let i=0;i<60&&(await debug()).progress<.27;i++)await page.clock.runFor(20);
    expect((await debug()).alpha,JSON.stringify(await debug())).toBe(0);
    const between=await captureRoomLight(page);
    for(let i=0;i<before.length;i++) expect(between[i]).toBeGreaterThan(dimmed[i]*1.1);
    for(let i=0;i<100&&(await debug()).progress<1;i++)await page.clock.runFor(40);
    const response=await page.evaluate(()=>{
      const s=(window as any).rhythmScene,v=s.waitingView;
      return {resets:s.session.waiting.resets,elapsed:s.session.waiting.elapsed,alpha:v.lampResponse.alpha,
        parent:v.lampResponse.parentContainer===v.container,width:v.lampResponse.displayWidth};
    });
    expect(response.resets).toBe(0); expect(response.elapsed).toBeGreaterThan(10.5); expect(response.alpha).toBe(0);
    expect(response.parent).toBe(true); expect(response.width).toBeGreaterThanOrEqual(960);
    // A storm flash paints the panes, without drawing a bolt path.
    const flash=await page.evaluate(()=>{
      const w=(window as any).rhythmScene.waitingView.weather,g=w.graphics;
      let paths=0,rectangles=0; const begin=g.beginPath,fill=g.fillRect;
      g.beginPath=function(){paths++;return begin.call(this);};
      g.fillRect=function(...args:any[]){rectangles++;return fill.apply(this,args);};
      try {w.render(0,0,1);} finally {g.beginPath=begin;g.fillRect=fill;}
      return{paths,rectangles};
    });
    expect(flash).toEqual({paths:0,rectangles:2});
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;s.weatherStarted=true;s.weatherElapsed=13.01;});
    await page.clock.runFor(40); await page.screenshot({path:`${directory}/${name}-window-flash.png`});
    await page.evaluate(()=>{
      const s=(window as any).rhythmScene.session;s.phase='ending';s.phaseTime=3.3;
      s.runner.travel=700*60;s.weatherStarted=false;
    });
    await page.clock.runFor(40); await expect(page.locator('.ending-caption')).toHaveCount(0);
    await expect(page.getByText('Ты куда-то торопишься',{exact:true})).toHaveCount(0);
    await page.screenshot({path:`${directory}/${name}-bench-without-caption.png`});
    expect(errors).toEqual([]);
    await writeFile(`${directory}/${name}-polish.json`,JSON.stringify({viewport:{width,height},route,lamp:{before,dimmed,between,response},flash,errors},null,2));
  });
}
