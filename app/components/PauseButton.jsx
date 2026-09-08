"use client";
import { useRef } from 'react';

// A menu tap must start and finish on this button, without a drag or second touch.
// Keyboard and assistive-technology activation keep their native click behavior.
export default function PauseButton({ onPause, children }) {
  const gesture = useRef(null);
  const clear = () => { gesture.current = null; };
  return <button type="button" aria-label="Pause" className="pause-control"
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      if (event.isPrimary === false || event.button !== 0) return;
      event.preventDefault();
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (start?.id === event.pointerId && Math.hypot(event.clientX-start.x,event.clientY-start.y) > 10) start.moved = true;
    }}
    onPointerUp={event => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      clear();
      const r = event.currentTarget.getBoundingClientRect();
      if (!start.moved && Math.hypot(event.clientX-start.x,event.clientY-start.y) <= 10 && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) onPause();
    }}
    onPointerCancel={clear} onLostPointerCapture={clear}
    onClick={event => { if (event.detail === 0) onPause(); }}>
    {children}
  </button>;
}
