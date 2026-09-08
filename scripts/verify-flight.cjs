const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  fs.mkdirSync('test-artifacts',{recursive:true});
  const browser = await chromium.launch({channel:'chromium',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  try {
    for (const profile of [{name:'desktop',viewport:{width:960,height:600},isMobile:false,hasTouch:false},{name:'touch',viewport:{width:393,height:852},isMobile:true,hasTouch:true}]) {
      const context = await browser.newContext({viewport:profile.viewport,isMobile:profile.isMobile,hasTouch:profile.hasTouch,deviceScaleFactor:1});
      const page = await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(`${process.env.FLIGHT_BASE_URL || 'http://localhost:3000'}/?debug=1`,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>Boolean(window.__kingfisherEngine?.renderer),null,{timeout:60000});
      assert.equal(await page.locator('.fatal-screen').count(),0);
      await page.screenshot({path:`test-artifacts/${profile.name}-menu.png`});
      // Real UI launch and live animation first, not an injected playing state.
      await page.locator('.hero-play').click();
      await page.waitForFunction(()=>window.__kingfisherEngine.state==='playing',null,{timeout:20000});
      const liveStart=await page.evaluate(()=>window.__kingfisherEngine._simulationTime);
      await page.waitForFunction(t=>window.__kingfisherEngine._simulationTime>t+0.02,liveStart,{timeout:15000});
      await page.screenshot({path:`test-artifacts/${profile.name}-playing.png`});
      const buttons=await page.locator('.action-controls .flight-control').count();assert.equal(buttons,4);
      const framing = await page.evaluate(() => {
        const e=window.__kingfisherEngine;
        e.bird.updateMatrixWorld(true); e.camera.updateMatrixWorld(true);
        const center=e.bird.position.clone().project(e.camera);
        const width=window.innerWidth,height=window.innerHeight;
        const telemetry=document.querySelector('.flight-telemetry').getBoundingClientRect();
        const centerX=(center.x*0.5+0.5)*width, centerY=(-center.y*0.5+0.5)*height;
        const labelClear=!(centerX>=telemetry.left&&centerX<=telemetry.right&&centerY>=telemetry.top&&centerY<=telemetry.bottom);
        const left=e.bird.position.clone().set(-2.6,0,0).applyMatrix4(e.bird.matrixWorld).project(e.camera).x;
        const right=e.bird.position.clone().set(2.6,0,0).applyMatrix4(e.bird.matrixWorld).project(e.camera).x;
        return {labelClear,left,right};
      });
      assert.ok(framing.labelClear,'telemetry overlaps bird center');
      assert.ok(Math.abs(framing.left)<0.95&&Math.abs(framing.right)<0.95,'wing span does not fit viewport');
      // Freeze only for deterministic controller/DOM regression checks. These are not FPS benchmarks.
      await page.evaluate(()=>{const e=window.__kingfisherEngine;cancelAnimationFrame(e.frame);e._frameTimestamp=null;e.startFreeFlight();});
      const box=await page.locator('.flight-controls .joystick-zone').boundingBox();assert.ok(box&&box.width>100);
      const origin={x:box.x+box.width*0.5,y:box.y+box.height*0.5};
      if(profile.hasTouch) {
        const cdp=await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:origin.x,y:origin.y,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+50,y:origin.y-15,id:1}]});
        const touchInput=await page.evaluate(()=>window.__kingfisherEngine._readInput());assert.ok(touchInput.x>0.7&&touchInput.y>0.1);
        const flap=await page.locator('.flap-control').boundingBox();
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:origin.x+50,y:origin.y-15,id:1},{x:flap.x+flap.width/2,y:flap.y+flap.height/2,id:2}]});
        const simultaneous=await page.evaluate(()=>window.__kingfisherEngine._readInput());assert.ok(simultaneous.x>0.7&&simultaneous.flap);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else {
        await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(origin.x+54,origin.y-16);
        const input=await page.evaluate(()=>window.__kingfisherEngine._readInput());assert.ok(input.x>0.7&&input.y>0.1);
        await page.mouse.up();
      }
      assert.deepEqual(await page.evaluate(()=>({...window.__kingfisherEngine.steering})),{x:0,y:0});
      await page.evaluate(()=>window.__kingfisherEngine._clearTransientInput());
      // Pointer capture cancellation must release action ownership.
      await page.locator('.brake-control').evaluate(el=>el.addEventListener('pointerdown',event=>{window.__testPointerId=event.pointerId;},{once:true}));
      const brakeBox=await page.locator('.brake-control').boundingBox();
      await page.mouse.move(brakeBox.x+brakeBox.width/2,brakeBox.y+brakeBox.height/2);await page.mouse.down();
      const pointerId=await page.evaluate(()=>window.__testPointerId);
      await page.locator('.brake-control').dispatchEvent('pointercancel',{pointerId,pointerType:'mouse'});await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.__kingfisherEngine._actions.brake.size),0);
      await page.evaluate(()=>window.__kingfisherEngine._clearTransientInput());
      await page.locator('.dive-control').click();
      assert.equal(await page.evaluate(()=>window.__kingfisherEngine.smartDiveCommit),true);
      await page.locator('.dive-control').click();
      assert.equal(await page.evaluate(()=>window.__kingfisherEngine.smartDiveCommit),false);
      await page.locator('.burst-control').click();
      assert.ok(await page.evaluate(()=>window.__kingfisherEngine.boostTimer>0));
      const cooldown=await page.evaluate(()=>{const e=window.__kingfisherEngine;const energy=e.energy;const result=e.boost();return {result,unchanged:energy===e.energy};});
      assert.deepEqual(cooldown,{result:false,unchanged:true});
      const mechanics=await page.evaluate(()=>{
        const e=window.__kingfisherEngine;e._clearTransientInput();e.startFreeFlight();
        e.setSteering(0.65,0.4);
        for(let i=0;i<24;i++)e._updateFlight(1/120,i/120,e._readInput());
        e.bird.updateMatrixWorld(true);
        const visual=e.forward.clone().set(0,0,-1).applyQuaternion(e.bird.quaternion);
        const alignment=visual.dot(e.forward);
        const yaw=e.yaw;
        e._setAction('flap',true,'touch');e._setAction('flap',true,'Space');e._setAction('flap',false,'touch');
        const independentSource=e._actions.flap.has('Space');e._clearTransientInput();
        e.fish.forEach(f=>{f.visible=false;});const fish=e.fish[0];fish.visible=true;fish.userData.caught=false;
        e.bird.position.set(0,-1,0);e.previousBirdPosition.set(0,-1,0.2);e.forward.set(0,0,-1);e._previousForward.set(0,0,-1);
        fish.position.set(0,-1,-2.1);fish.userData.previousPosition.copy(fish.position);e.currentTarget=fish;e.lockedTarget=fish;e.diveAttempt=true;e.lastCatchAt=-Infinity;
        const before=e.score;e._checkCatchAndBank(e._simulationTime+1);
        const caught=Boolean(e.holdingFish)&&e.score>before&&e._carryMesh.visible;
        const catchScore=e.score;const perch=e._nearestPerch().position;
        e.bird.position.copy(perch);e.previousBirdPosition.copy(perch).add(e.temp.set(0,0,5));e._checkCatchAndBank(e._simulationTime+2);
        const banked=e.catches===1&&!e.holdingFish&&e.score>catchScore&&!e._carryMesh.visible;
        // A world-origin shift must preserve camera, target, and swept-collision distances.
        e.bird.position.set(0,7,-190.1);e.previousBirdPosition.set(0,7,-190);e.camera.position.set(0,10,-182.1);e.cameraLook.set(0,7,-198);e._lastCameraBird.copy(e.bird.position);
        fish.position.set(0,-1,-191);fish.userData.previousPosition.copy(fish.position);
        const oldOffset=e.camera.position.z-e.bird.position.z;const oldTarget=fish.position.z-e.bird.position.z;e._scrollWorld();
        const seamSafe=Math.abs(e.camera.position.z-e.bird.position.z-oldOffset)<1e-9&&Math.abs(fish.position.z-e.bird.position.z-oldTarget)<1e-9&&e.previousBirdPosition.distanceTo(e.bird.position)<0.2;
        e._setAction('dive',true,'touch');e._onBlur();
        const blurSafe=e.state==='paused'&&!e.smartDiveCommit&&Object.values(e._actions).every(s=>s.size===0);
        e.startFreeFlight();e.renderer.render(e.scene,e.camera);
        return {alignment,yaw,independentSource,caught,banked,seamSafe,blurSafe};
      });
      assert.ok(mechanics.alignment>0.99999);assert.ok(mechanics.yaw>0.2);
      for(const key of ['independentSource','caught','banked','seamSafe','blurSafe'])assert.equal(mechanics[key],true,key);
      await page.screenshot({path:`test-artifacts/${profile.name}-verified.png`});
      assert.deepEqual(errors,[],`Browser errors: ${errors.join(' | ')}`);
      console.log(JSON.stringify({profile:profile.name,liveAnimation:true,buttons,...mechanics,errors}));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
