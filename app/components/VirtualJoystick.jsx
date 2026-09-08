"use client";
import { useEffect, useRef } from 'react';
import { radialInput, clamp } from '../lib/FlightMotion.mjs';

export default function VirtualJoystick({ onChange, disabled = false }) {
  const zoneRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const zone = zoneRef.current, base = baseRef.current, knob = knobRef.current;
    let pointer = null, anchor = null, rect = null, radius = 52;
    const paint = (dx, dy) => {
      base.style.left = `${anchor.x}px`; base.style.top = `${anchor.y}px`; base.style.bottom = 'auto';
      knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
    };
    const release = event => {
      if (pointer === null || (event?.pointerId !== undefined && pointer !== event.pointerId)) return;
      const id = pointer; pointer = null; anchor = null;
      zone.classList.remove('active'); base.classList.remove('active');
      base.style.removeProperty('left'); base.style.removeProperty('top'); base.style.removeProperty('bottom');
      knob.style.transform = 'translate3d(0,0,0)';
      callback.current?.(0, 0);
      try { if (zone.hasPointerCapture(id)) zone.releasePointerCapture(id); } catch {}
    };
    const down = event => {
      if (disabled || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      rect = zone.getBoundingClientRect();
      radius = clamp(Math.min(rect.width,rect.height)*0.2,42,60);
      // Input origin is exactly the touchdown position, never a displaced visual center.
      anchor = { x: event.clientX-rect.left, y: event.clientY-rect.top };
      pointer = event.pointerId;
      zone.setPointerCapture(pointer);
      zone.classList.add('active'); base.classList.add('active');
      paint(0,0); callback.current?.(0,0);
    };
    const move = event => {
      if (pointer !== event.pointerId || !anchor) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents?.();
      const sample = samples?.length ? samples[samples.length-1] : event;
      let dx = sample.clientX-rect.left-anchor.x, dy = sample.clientY-rect.top-anchor.y;
      const length = Math.hypot(dx,dy);
      if (length > radius) {
        // Floating origin follows overtravel so reversing direction needs little travel.
        const excess = length-radius;
        anchor.x += dx/length*excess; anchor.y += dy/length*excess;
        dx *= radius/length; dy *= radius/length;
      }
      paint(dx,dy);
      const intent = radialInput(dx/radius,-dy/radius,0.035,true);
      callback.current?.(intent.x,intent.y);
    };
    const visibility = () => { if (document.hidden) release(); };
    zone.addEventListener('pointerdown',down,{passive:false});
    zone.addEventListener('pointermove',move,{passive:false});
    for (const event of ['pointerup','pointercancel','lostpointercapture']) zone.addEventListener(event,release);
    window.addEventListener('blur',release); window.addEventListener('resize',release);
    document.addEventListener('visibilitychange',visibility);
    return () => {
      release();
      zone.removeEventListener('pointerdown',down); zone.removeEventListener('pointermove',move);
      for (const event of ['pointerup','pointercancel','lostpointercapture']) zone.removeEventListener(event,release);
      window.removeEventListener('blur',release); window.removeEventListener('resize',release);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[disabled]);

  return <div ref={zoneRef} className={`joystick-zone ${disabled ? 'disabled' : ''}`} role="application" aria-label="Flight steering: drag to turn and climb" onContextMenu={event => event.preventDefault()}>
    <div ref={baseRef} className="joystick-base">
      <span className="joystick-axis horizontal"/><span className="joystick-axis vertical"/>
      <span className="joystick-orbit outer"/><span className="joystick-orbit inner"/>
      <div ref={knobRef} className="joystick-knob"><span/></div>
    </div>
  </div>;
}
