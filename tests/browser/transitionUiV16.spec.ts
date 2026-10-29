import { finishRhythmRounds } from './rhythmHarness';
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { beginRhythm, bootRhythm } from './rhythmHarness';

const directory='docs/previews/transition-ui-v16';
for(const [width,height,name] of [[960,540,'desktop'],[390,844,'portrait'],[844,390,'landscape']] as const){
  test('immediate pipe tutorial, forward court exit and third room press: '+name,async({page})=>{
    test.setTimeout(90000); await page.setViewportSize({width,height}); await bootRhythm(page,name!=='desktop');
    await mkdir(directory,{recursive:true}); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    const read=()=>page.evaluate(()=>{
      const scene=(window as any).rhythmScene,s=scene.session,h=scene.runnerView.hero;
      return{phase:s.phase,time:s.phaseTime,progress:s.transitionProgress,pending:s.balanceIntroPending,
        balance:s.balance?.elapsed,pipeVisible:scene.pipeView.container.visible,
        modal:!!document.querySelector<HTMLDialogElement>('.balance-tutorial')?.open,
        hud:document.querySelectorAll('.balance-hud').length,
        hero:{flip:h.flipX,texture:h.texture.key,x:h.x,y:h.y,visible:h.visible},
        presses:s.waiting?.presses,resets:s.waiting?.resets,hint:s.waiting?.hint,elapsed:s.waiting?.elapsed};
    });
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;s.runner.objects=[];s.runner.travel=s.route.balanceAt*60-1;});
    const approach:any[]=[];
    for(let i=0;i<180;i++){
      await page.clock.runFor(40);const frame=await read();approach.push(frame);
      if(frame.pipeVisible){expect(frame.modal).toBe(true);expect(frame.hud).toBe(0);break;}
    }
    expect((await read()).pending).toBe(true); await expect(page.getByRole('dialog')).toBeVisible();
    const frozen=await read();await page.clock.runFor(2000);expect(await read()).toEqual(frozen);
    await page.screenshot({path:`${directory}/${name}-01-immediate-rules.png`});
    await page.getByRole('button',{name:'Понятно, пошатываемся'}).click({force:true});await page.clock.runFor(40);
    await expect(page.locator('.balance-hud')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({path:`${directory}/${name}-02-active-hud.png`});
    await page.evaluate(()=>{const b=(window as any).rhythmScene.session.balance;b.elapsed=35.99;b.position=0;b.velocity=0;});
    for(let i=0;i<15&&(await read()).phase==='balance';i++)await page.clock.runFor(40);
    const pipeExit=await read();expect(pipeExit.phase).toBe('pipe-exit');expect(pipeExit.hud).toBe(0);
    await page.screenshot({path:`${directory}/${name}-03-exit-without-hud.png`});
    for(let i=0;i<150&&(await read()).phase==='pipe-exit';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('runner');
    await beginRhythm(page);
    await page.evaluate(()=>{
      const e=(window as any).rhythmScene.session.stars;
      for(let i=0;i<3;i++){const n=e.notes.find((n:any)=>n.state==='pending');e.step(n.at+.26);}
    });
    await page.clock.runFor(40); await finishRhythmRounds(page);
    for(let i=0;i<160&&(await read()).phase!=='stars-exit';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('stars-exit');
    const courtExit:any[]=[];let captured=0;
    for(let i=0;i<170;i++){
      const frame=await read();if(frame.phase!=='stars-exit')break;
      courtExit.push(frame);expect(frame.hero.flip).toBe(false);expect(frame.hero.visible).toBe(true);
      if(frame.progress>0)expect(frame.hero.texture).toBe('night-hero');
      if(captured<3&&frame.progress>=[.1,.5,.9][captured]){
        await page.screenshot({path:`${directory}/${name}-04-court-exit-${captured}.png`});captured++;
      }
      await page.clock.runFor(40);
    }
    expect(captured).toBe(3);expect((await read()).phase).toBe('runner');expect((await read()).hero.flip).toBe(false);
    await page.evaluate(()=>{const s=(window as any).rhythmScene.session;s.runner.objects=[];s.runner.travel=s.route.waitingAt*60-1;});
    for(let i=0;i<180&&(await read()).phase!=='waiting';i++)await page.clock.runFor(40);
    expect((await read()).phase).toBe('waiting');
    const hint=page.getByText('Ты куда-то торопишься?',{exact:true});await expect(hint).toHaveCount(0);
    await page.getByRole('button',{name:/Выключить звук|Включить звук/}).click({force:true});
    expect((await read()).presses).toBe(0);
    const lamp=await page.evaluate(()=>{
      const s=(window as any).rhythmScene,c=s.waitingView.composition,cam=s.cameras.main;
      const p=cam.matrix.transformPoint(c.x+429*c.scaleX-cam.scrollX,c.y+154*c.scaleY-cam.scrollY);
      const r=s.game.canvas.getBoundingClientRect();return{x:r.x+p.x/s.scale.width*r.width,y:r.y+p.y/s.scale.height*r.height};
    });
    await page.mouse.click(lamp.x,lamp.y);await page.clock.runFor(40);
    expect((await read()).presses).toBe(1);expect((await read()).resets).toBe(0);await expect(hint).toHaveCount(0);
    await page.locator('main').focus();await page.keyboard.press('Space');await page.clock.runFor(40);
    expect((await read()).presses).toBe(2);expect((await read()).resets).toBe(1);await expect(hint).toHaveCount(0);
    if(name==='portrait'){
      const touch=await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...lamp,id:1}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else await page.mouse.click(lamp.x,lamp.y);
    await page.clock.runFor(40);const third=await read();
    expect(third.presses).toBe(3);expect(third.resets).toBe(1);await expect(hint).toHaveCount(0);
    const door=await page.evaluate(()=>{
      const s=(window as any).rhythmScene,c=s.waitingView.composition,cam=s.cameras.main;
      const p=cam.matrix.transformPoint(c.x+802*c.scaleX-cam.scrollX,c.y+275*c.scaleY-cam.scrollY);
      const r=s.game.canvas.getBoundingClientRect();return{x:r.x+p.x/s.scale.width*r.width,y:r.y+p.y/s.scale.height*r.height};
    });
    await page.mouse.click(door.x,door.y);await page.clock.runFor(40);await expect(hint).toBeVisible();
    await page.screenshot({path:`${directory}/${name}-05-third-press-hint.png`});
    await page.getByRole('button',{name:'Пауза',exact:true}).click({force:true});
    await page.clock.runFor(5000);expect((await read()).hint).toBe(true);expect((await read()).presses).toBe(4);
    await page.getByRole('button',{name:'Продолжить'}).click({force:true});
    for(const phase of ['room-rest','room-exit','final-run','ending']){
      await page.evaluate(async phase=>{
        const s=(window as any).rhythmScene.session;
        if(phase==='final-run'||phase==='ending'){
          const path='/src/game/runner/engine.ts',{RunnerEngine}=await import(/* @vite-ignore */ path);
          s.runner=new RunnerEngine(1,{start:s.route.waitingAt,end:s.route.availableEnd,empty:true,distanceScale:s.route.scale});
          s.runner.travel=(phase==='ending'?s.route.availableEnd:s.route.waitingAt+1)*60;
        }
        s.phase=phase;s.phaseTime=phase==='ending'?3.3:0;
      },phase);
      await page.clock.runFor(40);expect((await read()).phase).toBe(phase);await expect(hint).toHaveCount(0);
    }
    await page.screenshot({path:`${directory}/${name}-06-ending-without-hint.png`});
    expect(errors).toEqual([]);await writeFile(`${directory}/${name}.json`,JSON.stringify({viewport:{width,height},approach,pipeExit,courtExit,third,errors},null,2));
  });
}
