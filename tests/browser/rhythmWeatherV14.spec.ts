import { finishRhythmRounds } from './rhythmHarness';
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootRhythm, beginRhythm, readRhythm } from './rhythmHarness';
const directory = 'docs/previews/runner-room-v15';
for (const [width, height, name] of [[960,540,'desktop'],[390,844,'portrait'],[844,390,'landscape']] as const) {
  test('endless rhythm and continuous shelter entry, weather until 90s: ' + name, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize({width,height}); await bootRhythm(page); await mkdir(directory,{recursive:true});
    await page.evaluate(async()=>{
      const path='/src/game/views/WindowWeather.ts',{WindowWeather}=await import(/* @vite-ignore */ path);
      const render=WindowWeather.prototype.render;
      WindowWeather.prototype.render=function(...args:any[]){
        if(this===(window as any).rhythmScene.waitingView.weather)(window as any).windowRain=args[1];
        return render.apply(this,args as any);
      };
    });
    const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await beginRhythm(page);
    // Play the actual engine beyond its former scheduled ending, without forcing its outcome.
    await page.evaluate(() => {
      const e=(window as any).rhythmScene.session.stars;
      while(e.elapsed<40&&!e.outcome){
        for(const n of e.notes)if(n.state==='pending'&&Math.abs(n.at-e.elapsed)<1/120)e.press(n.direction);
        e.step();
      }
    });
    await page.clock.runFor(40); const alive=await readRhythm(page);
    expect(alive.phase).toBe('stars'); expect(alive.misses).toBe(0); expect(alive.elapsed).toBeGreaterThan(40);
    await expect(page.locator('.rhythm-attempts')).toContainText('Скорость ×3.0');
    await page.screenshot({path:directory+'/'+name+'-01-endless-speed.png'});
    await page.evaluate(() => {
      const e=(window as any).rhythmScene.session.stars;
      for(let i=0;i<2;i++){const n=e.notes.find((n:any)=>n.state==='pending');e.step(n.at+.26);}
    });
    await page.clock.runFor(40);expect((await readRhythm(page)).phase).toBe('stars');expect((await readRhythm(page)).misses).toBe(2);
    await page.screenshot({path:directory+'/'+name+'-02-two-mistakes.png'});
    await page.evaluate(() => {
      const e=(window as any).rhythmScene.session.stars,n=e.notes.find((n:any)=>n.state==='pending');e.step(n.at+.26);
    });
    await page.clock.runFor(40);expect((await readRhythm(page)).phase).toBe('stars-retry');
    await finishRhythmRounds(page); await page.clock.runFor(40);expect((await readRhythm(page)).phase).toBe('stars-failure');expect((await readRhythm(page)).misses).toBe(3);
    for(let i=0;i<100&&(await readRhythm(page)).phase!=='runner';i++)await page.clock.runFor(160);
    expect((await readRhythm(page)).phase).toBe('runner');
    await page.evaluate(() => {const s=(window as any).rhythmScene.session;s.runner.objects=[];s.runner.travel=s.route.waitingAt*60-396;});
    const read=()=>page.evaluate(()=>{
      const scene=(window as any).rhythmScene,s=scene.session,h=scene.runnerView.hero;
      return{phase:s.phase,time:s.phaseTime,weather:s.weatherStarted,age:s.weatherElapsed,cleared:s.weatherCleared,
        elapsed:s.waiting?.elapsed,shared:scene.arrivalView.hero===h,
        hero:{visible:h.visible,alpha:h.alpha,x:h.x,y:h.y,texture:h.texture.key},
        room:scene.waitingView.container.visible,rain:(window as any).windowRain};
    });
    for(let i=0;i<15&&!(await read()).weather;i++)await page.clock.runFor(20);
    const onset=await read();expect(onset.weather).toBe(true);expect(onset.phase).toBe('runner');expect(onset.hero.visible).toBe(true);
    const frames:any[]=[];
    for(const [i,at] of [.05,.7,1.2,1.8,2.2,2.7,3.2].entries()){
      for(let n=0;n<150&&(await read()).age<at;n++)await page.clock.runFor(20);
      const frame=await read();frames.push(frame);
      expect(frame.shared).toBe(true);
      if(at<=2.2){expect(frame.hero.visible).toBe(true);expect(frame.hero.alpha).toBe(1);expect(frame.hero.texture).toBe('night-hero');}
      await page.screenshot({path:directory+'/'+name+'-03-entry-'+i+'.png'});
    }
    expect(frames.at(-1).room).toBe(true);
    expect(frames.find(f=>f.room)?.age).toBeLessThan(3.3);
    for(let i=0;i<100&&(await read()).phase!=='waiting';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('waiting');
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;for(let i=0;i<88*120;i++)s.step();});
    await page.clock.runFor(40);const wet=await read();
    expect(wet.elapsed).toBeGreaterThan(88);expect(wet.cleared).toBe(false);expect(wet.rain).toBeGreaterThan(0);
    await page.screenshot({path:directory+'/'+name+'-04-rain-89s.png'});
    // Resetting inactivity cannot stop the weather merely because 90 total seconds passed.
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;s.gameplayInput();for(let i=0;i<5*120;i++)s.step();});
    await page.clock.runFor(40);expect((await read()).age).toBeGreaterThan(90);expect((await read()).cleared).toBe(false);
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;while(s.phase==='waiting')s.step();});
    await page.clock.runFor(40);const rest=await read();
    expect(rest.phase).toBe('room-rest');expect(rest.elapsed).toBe(90);expect(rest.cleared).toBe(true);
    for(let i=0;i<25&&(await read()).time<.65;i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('room-rest');expect((await read()).rain).toBe(0);
    await page.screenshot({path:directory+'/'+name+'-05-dry-rest.png'});
    for(let i=0;i<100&&(await read()).phase==='room-rest';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('room-exit');
    for(let i=0;i<100&&(await read()).phase==='room-exit';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('final-run');
    await page.screenshot({path:directory+'/'+name+'-06-running-again.png'});
    expect(errors).toEqual([]);
    await writeFile(directory+'/'+name+'.json',JSON.stringify({viewport:{width,height},onset,frames,wet,rest,errors},null,2));
  });
}
