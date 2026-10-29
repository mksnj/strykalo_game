import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { startCourt } from './courtHarness';

const directory = 'docs/previews/entry-control-pipe-v11';
for (const [width, height] of [[960,540],[1588,801],[1230,372],[375,667]]) {
  for (const stage of ['approach','span','departure']) {
    test(`труба только между берегами: ${stage}, ${width}x${height}`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({width,height}); await startCourt(page);
      await page.evaluate(async stage => {
        const a='/src/game/state/RunSession.ts',b='/src/game/runner/engine.ts';
        const {RunSession}=await import(/* @vite-ignore */ a), {RunnerEngine}=await import(/* @vite-ignore */ b);
        const scene=(window as any).courtScene,s=new RunSession(1,true),after=stage==='departure';
        s.runner=new RunnerEngine(1,{start:after?20:0,end:after?50:20,score:17,empty:true,distanceScale:10});
        s.runner.travel=(stage==='approach'?16:20)*60; s.step=()=>{};
        scene.session=s;scene.lastPhase='runner';scene.accumulator=0;scene.visualTime=0;
      },stage);
      await page.clock.runFor(40);
      const state=await page.evaluate(()=>{
        const scene=(window as any).courtScene,c=scene.cameras.main,p=scene.runnerView.crossing;
        const r=scene.game.canvas.getBoundingClientRect(),bounds=p.pipe.getBounds();
        const screen=(x:number,y:number)=>({x:r.left+(x-c.worldView.x)*c.zoom*r.width/c.width,
          y:r.top+(y-c.worldView.y)*c.zoom*r.height/c.height});
        return {pipe:{left:bounds.left,right:bounds.right},banks:{near:p.excavation.x,far:p.excavation.x+p.excavation.displayWidth},
          visible:p.container.visible,mask:!!p.pipe.mask,near:screen(p.excavation.x,438),
          far:screen(p.excavation.x+p.excavation.displayWidth,438),canvasBottom:r.bottom};
      });
      expect(state.visible).toBe(true);expect(state.mask).toBe(true);
      expect(state.pipe.left).toBeCloseTo(state.banks.near,6);expect(state.pipe.right).toBeCloseTo(state.banks.far,6);
      await mkdir(directory,{recursive:true});
      const name=`pipe-${width}x${height}-${stage}`;
      const visible=await page.screenshot({path:`${directory}/${name}.png`});
      await page.evaluate(()=>{const s=(window as any).courtScene;s.runnerView.crossing.pipe.setVisible(false);s.visualTime=0;});
      await page.clock.runFor(20);
      const hidden=await page.screenshot();
      const pixels=await page.evaluate(async({visible,hidden,state})=>{
        const frames=await Promise.all([visible,hidden].map(async data=>{
          const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();
          const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
          const x=c.getContext('2d')!;x.drawImage(i,0,0);
          return {width:i.width,height:i.height,data:x.getImageData(0,0,i.width,i.height).data};
        }));
        let outside=0,inside=0; const samples: {x:number;y:number;a:number[];b:number[]}[]=[];
        // Compare the asphalt from groundY downward. The curb and animated
        // television water behind it are outside this pipe-overlap check.
        for(let y=Math.max(0,Math.ceil(state.near.y));y<Math.min(frames[0].height,Math.floor(state.canvasBottom));y++) {
          for(let x=0;x<frames[0].width;x++) {
            const i=(y*frames[0].width+x)*4;
            const changed=[0,1,2].some(c=>Math.abs(frames[0].data[i+c]-frames[1].data[i+c])>2);
            if(changed) {
              if(x<state.near.x-2||x>state.far.x+2){outside++;if(samples.length<30)samples.push({x,y,a:[...frames[0].data.slice(i,i+3)],b:[...frames[1].data.slice(i,i+3)]});}else inside++;
            }
          }
        }
        return {outside,inside,samples};
      },{visible:visible.toString('base64'),hidden:hidden.toString('base64'),state});
      await writeFile(`${directory}/${name}.json`,JSON.stringify({width,height,stage,state,pixels},null,2));
      expect(pixels.outside,JSON.stringify({state,pixels})).toBe(0);
      expect(pixels.inside,'сравнение действительно видит трубу внутри выемки').toBeGreaterThan(50);
      await writeFile(`${directory}/${name}.json`,JSON.stringify({width,height,stage,state,pixels},null,2));
    });
  }
}

