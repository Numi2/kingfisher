import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightClock, FlightPadEdges } from '../app/lib/FlightSession.mjs';

const pad = (pressed=[], mapping='standard', index=0) => ({ connected:true, id:'test-controller', index, mapping, buttons:Array.from({length:18},(_,i)=>({pressed:pressed.includes(i)})) });

test('visible stalls have bounded work and never manufacture a pause',()=>{
 const c=new FlightClock();c.sample(1000);const f=c.sample(4100);
 assert.equal(f.delta,1/15);assert.equal(f.steps,8);assert.equal(c.stalls,1);assert.equal(c.suspended,false);
});
test('background intervals are frozen and do not catch up on return',()=>{
 const c=new FlightClock();c.sample(1000);c.setHidden(true);
 assert.equal(c.sample(1100).delta,0);assert.equal(c.sample(60000).delta,0);
 c.setHidden(false);assert.equal(c.sample(61000).delta,0);
 assert.ok(Math.abs(c.sample(61016).delta-.016)<1e-12);
});
test('context restoration is independent of hidden state',()=>{
 const c=new FlightClock();c.setContextLost(true);c.setHidden(true);c.setHidden(false);
 assert.equal(c.suspended,true);c.setContextLost(false);assert.equal(c.suspended,false);
});
test('manual pause is an input to the clock, not a timing heuristic',()=>{
 const c=new FlightClock();c.sample(0);assert.equal(c.sample(1000,false).delta,0);
 c.reset();assert.equal(c.sample(7000).delta,0);assert.ok(c.sample(7016).delta>0);
});
test('invalid timestamps do not poison the next frame',()=>{
 const c=new FlightClock();c.sample(1000);assert.equal(c.sample(NaN).steps,0);
 assert.equal(c.sample(999).delta,0);assert.ok(c.sample(1010).delta>0);
});
test('normal-refresh game clock stays consistent at 30/60/120/144 Hz',()=>{
 for(const hz of [30,60,120,144]){const c=new FlightClock();let sum=0;c.sample(0);for(let i=1;i<=hz;i++)sum+=c.sample(i*1000/hz).delta;assert.ok(Math.abs(sum-1)<1e-12);}
});
test('already-held Start on first connection cannot open a menu',()=>{
 const p=new FlightPadEdges();assert.deepEqual(p.sample(pad([9]),0),[]);
 assert.deepEqual(p.sample(pad([9]),20),[]);assert.deepEqual(p.sample(pad(),40),[]);
 assert.deepEqual(p.sample(pad([9]),60),[['pause',true]]);
 assert.deepEqual(p.sample(pad([9]),80),[]);
});
test('reconnecting with Start held requires another neutral sample',()=>{
 const p=new FlightPadEdges();p.sample(pad(),0);p.sample(pad([9]),400);
 p.sample(null,450);assert.deepEqual(p.sample(pad([9]),800),[]);
 p.sample(pad(),850);assert.deepEqual(p.sample(pad([9]),900),[['pause',true]]);
});
test('nonstandard buttons never imply known flight or pause actions',()=>{
 const p=new FlightPadEdges();p.sample(pad([],'custom'),0);
 assert.deepEqual(p.sample(pad([0,1,2,5,9],'custom'),100),[]);
});
test('disconnect releases action ownership',()=>{
 const p=new FlightPadEdges();p.sample(pad(),0);
 assert.deepEqual(p.sample(pad([0]),30),[['flap',true]]);
 assert.deepEqual(p.sample(null,50),[['flap',false]]);
});
test('reset does not replay held buttons after resume',()=>{
 const p=new FlightPadEdges();p.sample(pad(),0);p.sample(pad([9]),400);p.reset();
 assert.deepEqual(p.sample(pad([9]),700),[]);
});
test('pause debounce rejects short press bounce without blocking later presses',()=>{
 const p=new FlightPadEdges();p.sample(pad(),0);assert.deepEqual(p.sample(pad([9]),400),[['pause',true]]);
 p.sample(pad(),410);assert.deepEqual(p.sample(pad([9]),420),[]);
 p.sample(pad(),450);assert.deepEqual(p.sample(pad([9]),800),[['pause',true]]);
});
