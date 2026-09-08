const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async()=>{
 fs.mkdirSync('test-artifacts',{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
 try {
  if(process.argv.includes('--baseline')){
   const p=await browser.newPage({viewport:{width:960,height:600}});
   await p.goto('https://kingfisher-zeta.vercel.app/?debug=1',{waitUntil:'networkidle'});
   await p.waitForFunction(()=>!!window.__kingfisherEngine?.renderer,null,{timeout:60000});
   const result=await p.evaluate(()=>{
    const e=window.__kingfisherEngine;cancelAnimationFrame(e.frame);e.startFreeFlight();
    window.dispatchEvent(new Event('blur'));const blurOpensMenu=e.state==='paused';
    e.startFreeFlight();e._frameTimestamp=1000;e._tick(4100);cancelAnimationFrame(e.frame);
    return {blurOpensMenu,stallOpensMenu:e.state==='paused'};
   });
   await p.screenshot({path:'test-artifacts/baseline-unexpected-pause.png'});
   console.log('BASELINE',JSON.stringify(result));
   fs.writeFileSync('test-artifacts/baseline.json',JSON.stringify(result,null,2));
   await p.close();return;
  }
  for(const profile of [
    {name:'desktop',viewport:{width:960,height:600},touch:false},
    {name:'portrait',viewport:{width:393,height:852},touch:true},
    {name:'landscape',viewport:{width:852,height:393},touch:true}
  ]){
   const ctx=await browser.newContext({viewport:profile.viewport,isMobile:profile.touch,hasTouch:profile.touch,deviceScaleFactor:1});
   const p=await ctx.newPage();const errors=[];
   p.on('pageerror',e=>errors.push(String(e)));
   p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.goto(`${process.env.FLIGHT_BASE_URL||'http://localhost:3000'}/?debug=1`,{waitUntil:'networkidle'});
   await p.waitForFunction(()=>!!window.__kingfisherEngine?.renderer,null,{timeout:60000});
   await p.locator('.hero-play').click();
   await p.waitForFunction(()=>window.__kingfisherEngine.state==='playing',null,{timeout:20000});
   const before=await p.evaluate(()=>window.__kingfisherEngine._simulationTime);
   await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
   await p.waitForFunction(t=>window.__kingfisherEngine._simulationTime>t+.02,before,{timeout:15000});
   assert.equal(await p.locator('.pause-layer').count(),0,'visible blur opened pause UI');
   const simBefore=await p.evaluate(()=>window.__kingfisherEngine._simulationTime);
   const targets=await p.locator('.action-controls .flight-control').evaluateAll(elements=>elements.map(el=>{
     const r=el.getBoundingClientRect();
     return {label:el.getAttribute('aria-label'),left:r.left,top:r.top,right:r.right,bottom:r.bottom,inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};
   }));
   assert.ok(targets.every(t=>t.inViewport),'Offscreen action controls: '+JSON.stringify(targets));
   await p.screenshot({path:`test-artifacts/session-${profile.name}-controls.png`});
   if(profile.touch){
    const cdp=await ctx.newCDPSession(p);
    const z=await p.locator('.flight-controls .joystick-zone').boundingBox();
    const f=await p.locator('.flap-control').boundingBox();
    const x=z.x+z.width*.5,y=z.y+z.height*.5;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+45,y:y-12,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+45,y:y-12,id:1},{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]});
    const active=await p.evaluate(()=>window.__kingfisherEngine._readInput());
    assert.ok(active.x>.6&&active.flap,'multitouch steering and flap lost');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   } else {
    await p.keyboard.down('KeyD');await p.keyboard.down('Space');
    await p.waitForFunction(t=>window.__kingfisherEngine._simulationTime>t+.04,simBefore,{timeout:15000});
    await p.keyboard.up('Space');await p.keyboard.up('KeyD');
   }
   assert.equal(await p.locator('.pause-layer').count(),0,'flight actions opened menu');
   await p.screenshot({path:`test-artifacts/session-${profile.name}-flying.png`});
   // Isolate timing and input transitions from software-GPU render speed.
   await p.evaluate(()=>{const e=window.__kingfisherEngine;cancelAnimationFrame(e.frame);e.startFreeFlight();});
   const timer=await p.evaluate(()=>{
    const e=window.__kingfisherEngine;e.mode='hunt';e.timeRemaining=100;e.flightClock.reset();
    e._tick(1000);cancelAnimationFrame(e.frame);e._tick(4100);cancelAnimationFrame(e.frame);
    return {state:e.state,lostTime:100-e.timeRemaining,history:e.pauseHistory.length,stalls:e.flightClock.stalls};
   });
   assert.equal(timer.state,'playing');assert.ok(timer.lostTime<=1/15+1e-9);assert.equal(timer.history,0);
   const visibility=await p.evaluate(()=>{
    const e=window.__kingfisherEngine;
    Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));
    const t=e.timeRemaining,pos=e.bird.position.clone();
    e._tick(60000);cancelAnimationFrame(e.frame);
    const frozen=e.timeRemaining===t&&e.bird.position.equals(pos);
    delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
    e._tick(80000);cancelAnimationFrame(e.frame);
    return {frozen,stillFlying:e.state==='playing',noCatchup:e.timeRemaining===t};
   });
   assert.deepEqual(visibility,{frozen:true,stillFlying:true,noCatchup:true});
   await p.locator('.pause-control').focus();await p.keyboard.press('Space');
   assert.equal(await p.evaluate(()=>window.__kingfisherEngine.state),'playing');
   assert.ok(await p.evaluate(()=>window.__kingfisherEngine.flapPulseTimer>0));
   await p.evaluate(()=>window.__kingfisherEngine._clearTransientInput());
   const r=await p.locator('.pause-control').boundingBox();
   await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();
   await p.mouse.move(r.x-30,r.y+60);await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.up();
   assert.equal(await p.locator('.pause-layer').count(),0,'drag was mistaken for Pause');
   await p.locator('.pause-control').click();await p.waitForSelector('.pause-layer');
   assert.equal(await p.locator('.resume').evaluate(el=>el===document.activeElement),true);
   await p.evaluate(()=>{window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await p.locator('.pause-layer').count(),1);
   await p.keyboard.press('Space');await p.waitForSelector('.state-playing');
   assert.equal(await p.locator('.game-shell').evaluate(el=>el===document.activeElement),true);
   await p.keyboard.down('KeyD');
   assert.ok(await p.evaluate(()=>window.__kingfisherEngine._readInput().x>.9));
   await p.keyboard.up('KeyD');
   await p.keyboard.press('Escape');await p.waitForSelector('.pause-layer');
   await p.keyboard.press('Escape');await p.waitForSelector('.state-playing');
   const gamepad=await p.evaluate(()=>{
    const e=window.__kingfisherEngine;
    const create=(held=[],mapping='standard')=>({id:'test-pad',index:0,connected:true,mapping,axes:[0,0],buttons:Array.from({length:18},(_,i)=>({pressed:held.includes(i)}))});
    let current=create([9]);Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>current?[current]:[]});
    e._readInput();const initialSafe=e.state==='playing';
    current=null;e._readInput();current=create([9]);e._readInput();const reconnectSafe=e.state==='playing';
    current=create();e._readInput();e.padEdges.lastPauseAt=-Infinity;current=create([9]);e._readInput();const intentional=e.state==='paused';
    e.setPaused(false);e._readInput();const heldResumeSafe=e.state==='playing';
    current=create([0,9],'custom');e._readInput();const customSafe=e.state==='playing';
    delete navigator.getGamepads;e._clearTransientInput();
    return {initialSafe,reconnectSafe,intentional,heldResumeSafe,customSafe};
   });
   assert.ok(Object.values(gamepad).every(Boolean),JSON.stringify(gamepad));
   const labels=await p.locator('.flight-controls .action-label').evaluateAll(elements=>elements.every(el=>el.getBoundingClientRect().width<=1));
   assert.ok(labels);assert.equal(await p.locator('.flight-control[aria-label]').count(),4);
   assert.deepEqual(errors,[],errors.join('\n'));
   console.log('SESSION_VERIFIED',JSON.stringify({profile:profile.name,timer,visibility,gamepad,liveFlight:true,errors}));
   fs.writeFileSync(`test-artifacts/session-${profile.name}.json`,JSON.stringify({profile,timer,visibility,gamepad,errors},null,2));
   await ctx.close();
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
