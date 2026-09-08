import test from 'node:test';
import assert from 'node:assert/strict';
import { radialInput, initializeMotion, stepFlightMotion, springVector, sweptDistance, wrapAngle } from '../app/lib/FlightMotion.mjs';

const environment = { underwater:false, sensitivity:1, wingPower:1, assist:0.58, wind:0, current:0, time:0 };
function state() {
  const s = { bird:{position:{x:0,y:7,z:0}}, yaw:0,pitch:0,bank:0,speed:12.5,energy:1,holdingFish:null,surfaceAssistTimer:0,bankBoostTimer:0,focusActive:false,forward:{x:0,y:0,z:-1},velocity:{x:0,y:0,z:-12.5} };
  initializeMotion(s); return s;
}
function advance(s,input,seconds,fps=120,env=environment) {
  const n = Math.round(seconds*fps);
  for(let i=0;i<n;i++) stepFlightMotion(s,{x:0,y:0,dive:false,flap:false,brake:false,...input},env,seconds/n);
  return s;
}

test('radial response preserves diagonal direction and bounded magnitude',()=>{
  assert.deepEqual(radialInput(0.01,-0.01),{x:0,y:0});
  const r = radialInput(1,1,0.035,true);
  assert.ok(Math.abs(Math.hypot(r.x,r.y)-1)<1e-12);
  assert.equal(r.x,r.y);
  assert.deepEqual(radialInput(NaN,Infinity),{x:0,y:0});
  for(let i=0;i<100;i++) { const a=radialInput(i/100,0,0.035,true),b=radialInput((i+1)/100,0,0.035,true); assert.ok(b.x>=a.x); }
});
test('full turn reaches useful authority within 100 ms',()=>{
  const s=advance(state(),{x:1},0.1);
  assert.ok(s.yawVelocity>2.8); assert.ok(s.yaw>0.19);
  assert.ok(s.forward.x>0); assert.ok(s.bank<0);
});
test('release settles rotation without event-count-dependent impulses',()=>{
  const s=advance(state(),{x:1},0.5);
  advance(s,{x:0},0.15);
  assert.ok(Math.abs(s.yawVelocity)<0.035);
});
test('reversing input promptly reverses the turn',()=>{
  const s=advance(state(),{x:1},0.5);
  advance(s,{x:-1},0.1);
  assert.ok(s.yawVelocity < -2.8);
});
test('yaw integrates consistently at 30, 60, 120 and 144 Hz',()=>{
  const values=[30,60,120,144].map(fps=>advance(state(),{x:0.6},1,fps));
  for(const s of values) assert.ok(Math.abs(wrapAngle(s.yaw-values[0].yaw))<1e-9);
  console.log('One-second turn (radians), 30/60/120/144 Hz:',values.map(s=>s.yaw));
});
test('braking slows flight and tightens the turn radius',()=>{
  const normal=advance(state(),{x:1},0.5);
  const brake=advance(state(),{x:1,brake:true},0.5);
  assert.ok(brake.speed<5); assert.ok(brake.yawVelocity>4.6);
  assert.ok(brake.speed/brake.yawVelocity<normal.speed/normal.yawVelocity*0.4);
  assert.equal(brake.flightAction,'BRAKE');
});
test('flapping accelerates without forcing a constant climb',()=>{
  const s=advance(state(),{flap:true},0.5);
  assert.ok(s.speed>19); assert.ok(Math.abs(s.pitch)<1e-12); assert.ok(s.energy<1);
});
test('burst acceleration is bounded and its timer expires',()=>{
  const s=state();s.boostTimer=0.65;s.boostCooldown=1.3;
  advance(s,{},0.2);assert.ok(s.speed>25);assert.equal(s.flightAction,'BURST');
  advance(s,{},1.3);assert.equal(s.boostTimer,0);assert.equal(s.boostCooldown,0);assert.ok(s.speed<17);
});
test('strong manual input overrides opposing dive targeting',()=>{
  const a=advance(state(),{x:1,y:1,dive:true},0.25,120,{...environment,target:{x:-12,y:-2,z:-12}});
  const b=advance(state(),{x:1,y:1,dive:true},0.25);
  assert.ok(Math.abs(a.yaw-b.yaw)<1e-10);assert.ok(Math.abs(a.pitch-b.pitch)<1e-10);
});
test('flap wins over dive and produces underwater recovery',()=>{
  const s=state();s.bird.position.y=-2;
  advance(s,{flap:true,dive:true},0.5,120,{...environment,underwater:true});
  assert.ok(s.pitch>0.9);assert.equal(s.flightAction,'SURFACE');assert.ok(s.bird.position.y>-1);
});
test('explicit downward steering overrides catch recovery',()=>{
  const s=state();s.surfaceAssistTimer=1;
  advance(s,{y:-1},0.5);assert.ok(s.pitch < -0.9);
});
test('moving-point sweep catches fast crossing and rejects remote fish',()=>{
  assert.equal(sweptDistance(-4,0,0,4,0,0),0);
  assert.equal(sweptDistance(-4,5,0,4,5,0),5);
  assert.equal(sweptDistance(3,4,0,3,4,0),5);
});
test('exact camera spring is stable and partition independent',()=>{
  const p={x:10,y:-4,z:2},v={x:0,y:0,z:0},q={x:0,y:0,z:0};
  const p2={...p},v2={...v};springVector(p,v,q,17,0.1);
  for(let i=0;i<12;i++)springVector(p2,v2,q,17,1/120);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(p[axis]-p2[axis])<1e-10);
});
test('long mixed-input run keeps state finite and forward normalized',()=>{
  const s=state();
  for(let i=0;i<12000;i++) {
    stepFlightMotion(s,{x:Math.sin(i*.02),y:Math.cos(i*.013),brake:i%400<30,flap:i%300<40,dive:i%600<100},environment,1/120);
    const values=[s.yaw,s.pitch,s.bank,s.yawVelocity,s.pitchVelocity,s.speed,s.energy,...Object.values(s.bird.position)];
    assert.ok(values.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(s.forward.x,s.forward.y,s.forward.z)-1)<1e-9);
    assert.ok(s.energy>=0&&s.energy<=1);
  }
});
