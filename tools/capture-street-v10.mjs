import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.argv.includes('--directory') ? process.argv[process.argv.indexOf('--directory') + 1] : 'docs/previews/street-v10', report = [];
const server = await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true,hmr:false}});
let browser;
try {
  await server.listen(); browser=await chromium.launch({channel:'msedge',headless:true});
  await mkdir(directory,{recursive:true});
  for (const [width,height] of [[960,540],[1920,1080],[1230,372],[375,667]]) {
    const page=await browser.newPage({viewport:{width,height}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();await page.goto('http://127.0.0.1:5178/');
    await page.getByRole('button',{name:'Начать путь'}).waitFor();
    await page.evaluate(async()=>{
      const {RunnerView}=await import('/src/game/views/RunnerView.ts'), render=RunnerView.prototype.render;
      RunnerView.prototype.render=function(...args){window.courtScene=this.scene;return render.apply(this,args);};
    });
    await page.clock.pauseAt(new Date(Date.now()+1000));
    await page.getByRole('button',{name:'Начать путь'}).click();
    await page.getByRole('button',{name:'Понятно, в путь'}).click();await page.clock.runFor(80);
    for(const developer of [false,true]) {
      for(const stage of ['yard','before','entry','gate']) {
        await page.evaluate(async({developer,stage})=>{
          const {RunSession}=await import('/src/game/state/RunSession.ts');
          const {RunnerEngine}=await import('/src/game/runner/engine.ts');
          const s=new RunSession(1,developer), end=s.route.starsAt;
          s.runner=new RunnerEngine(1,{start:s.route.balanceAt,end,score:17,empty:true,distanceScale:s.route.scale});
          s.runner.travel=(stage==='yard' ? 325/s.route.scale : stage==='before' ? end-.1 : end)*60;
          if(stage==='entry'||stage==='gate'){s.phase='stars-approach';s.phaseTime=(stage==='gate'?.55:.45)*4.8;}
          s.step=()=>{};const scene=window.courtScene;scene.session=s;scene.lastPhase=s.phase;scene.accumulator=0;
        },{developer,stage});
        await page.clock.runFor(80);
        const file=`${developer?'short':'normal'}-${width}x${height}-${stage}.png`;
        await page.screenshot({path:`${directory}/${file}`});
        const geometry=await page.evaluate(()=>{
          const scene=window.courtScene,art=scene.runnerView.nightArt;
          return {phase:scene.session.phase,arenaVisible:scene.starsView.arena.container.visible,
            arenaAlpha:scene.starsView.arena.container.alpha,facadeMask:!!art.court.mask,
            memoryTextures:['memories','route92','memory-courtyard'].filter(k=>scene.textures.exists(k)),
            hero:{x:scene.runnerView.hero.x,y:scene.runnerView.hero.y},
            entrance:{visible:scene.runnerView.courtEntrance?.container.visible,x:scene.runnerView.courtEntrance?.container.x},
            distance:scene.session.distance,score:scene.session.score};
        });
        if(geometry.arenaVisible||geometry.facadeMask||geometry.memoryTextures.length)throw new Error(JSON.stringify(geometry));
        report.push({width,height,developer,stage,file,geometry,errors});
      }
    }
    await page.close();console.log(`${width}x${height}: ordinary street only, both routes`);
  }
  await writeFile(`${directory}/capture.json`,JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}

