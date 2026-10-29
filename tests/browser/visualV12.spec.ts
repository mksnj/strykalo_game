import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';

for (const [width, height, name] of [[960,540,'desktop'],[390,844,'portrait'],[844,390,'landscape']] as const) {
  test('preserved sunset, room reactions and bench: ' + name, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize({width,height}); await bootRhythm(page);
    const directory = 'docs/previews/visual-v12'; await mkdir(directory,{recursive:true});
    await page.evaluate(async () => {
      const path='/src/game/minigames/balance/BalanceEngine.ts', {BalanceEngine}=await import(/* @vite-ignore */ path);
      const s=(window as any).rhythmScene.session; s.phase='balance'; s.balance=new BalanceEngine(1);
    });
    await page.clock.runFor(40); await page.screenshot({path:directory+'/'+name+'-01-sunset.png'});
    await page.evaluate(async () => {
      const path='/src/game/minigames/waiting/WaitingEngine.ts', {WaitingEngine}=await import(/* @vite-ignore */ path);
      const s=(window as any).rhythmScene.session; s.phase='waiting'; s.waiting=new WaitingEngine();
      for(let i=0;i<1200;i++)s.waiting.step();
    });
    await page.clock.runFor(40); await page.screenshot({path:directory+'/'+name+'-07-graffiti.png'});
    for(const [object,x,y] of [['lamp',429,154],['window',580,210],['clock',717,145],['hero',402,350]] as const){
      const point=await page.evaluate(({x,y})=>{
        const s=(window as any).rhythmScene,c=s.waitingView.composition,cam=s.cameras.main;
        const p=cam.matrix.transformPoint(c.x+x*c.scaleX-cam.scrollX,c.y+y*c.scaleY-cam.scrollY);
        const rect=s.game.canvas.getBoundingClientRect();
        return{x:rect.x+p.x/s.scale.width*rect.width,y:rect.y+p.y/s.scale.height*rect.height};
      },{x,y});
      for(let n=0;n<4;n++)await page.mouse.click(point.x,point.y);
      await page.clock.runFor(400);
      const response=await page.evaluate(object=>{
        const s=(window as any).rhythmScene,v=s.waitingView;
        return{progress:v.reactions.progress(object,v.visualTime),resets:s.session.waiting.resets};
      },object);
      expect(response.resets).toBe(0);expect(response.progress).toBeGreaterThan(0);expect(response.progress).toBeLessThan(1);
      await page.screenshot({path:directory+'/'+name+'-08-'+object+'.png'});await page.clock.runFor(2200);
    }
    await page.evaluate(async()=>{
      const path='/src/game/runner/engine.ts',{RunnerEngine}=await import(/* @vite-ignore */ path);
      const s=(window as any).rhythmScene.session;
      s.runner=new RunnerEngine(1,{start:s.route.waitingAt,end:s.route.availableEnd,score:17,empty:true,distanceScale:s.route.scale});
      s.runner.travel=s.route.availableEnd*60;s.phase='ending';s.phaseTime=3.3;
    });
    await page.clock.runFor(40);await page.screenshot({path:directory+'/'+name+'-09-bench.png'});
    await page.evaluate(()=>{(window as any).rhythmScene.session.phaseTime=10.5;});
    await page.clock.runFor(40);await page.screenshot({path:directory+'/'+name+'-10-door.png'});
    expect(await page.evaluate(()=>{const h=(window as any).rhythmScene.endingView.hero;return[h.displayWidth,h.displayHeight];})).toEqual([106,106]);
  });
}
