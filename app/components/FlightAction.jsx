"use client";
import { useEffect, useRef } from 'react';

export default function FlightAction({ className = '', icon, label, shortcut, hint, onHold, disabled = false, active = false, cooldown = 0 }) {
  const element = useRef(null), pointer = useRef(null), keyboard = useRef(false), callback = useRef(onHold);
  callback.current = onHold;
  const release = event => {
    if (pointer.current === null && !keyboard.current) return;
    if (event?.pointerId !== undefined && pointer.current !== event.pointerId) return;
    const id = pointer.current;
    pointer.current = null; keyboard.current = false;
    element.current?.classList.remove('pressed'); callback.current?.(false);
    try { if (id !== null && element.current?.hasPointerCapture(id)) element.current.releasePointerCapture(id); } catch {}
  };
  useEffect(() => {
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur',release); document.addEventListener('visibilitychange',visibility);
    if (disabled) release();
    return () => { release(); window.removeEventListener('blur',release); document.removeEventListener('visibilitychange',visibility); };
    // The callback ref intentionally avoids cancelling a held action on every HUD update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[disabled]);
  return <button ref={element} type="button" className={`flight-control ${className} ${active ? 'active' : ''}`}
    disabled={disabled} aria-label={label} aria-pressed={active} title={hint || label}
    style={{'--action-cooldown': Math.max(0,Math.min(1,cooldown))}}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      if (disabled || pointer.current !== null || keyboard.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.classList.add('pressed'); callback.current?.(true);
    }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={event => {
      if (!['Space','Enter'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation();
      if (disabled || event.repeat || keyboard.current || pointer.current !== null) return;
      keyboard.current = true; element.current.classList.add('pressed'); callback.current?.(true);
    }}
    onKeyUp={event => { if (['Space','Enter'].includes(event.code)) { event.preventDefault(); event.stopPropagation(); release(); } }}
    onBlur={release}
    onClick={event => { if (event.detail === 0 && !disabled && !keyboard.current && pointer.current === null) { callback.current?.(true); callback.current?.(false); } }}>
    <span className="control-ripple"/>{icon}<span className="action-label">{label}</span>{shortcut ? <kbd>{shortcut}</kbd> : null}
    {className.includes('burst') ? <span className="action-cooldown"/> : null}
  </button>;
}
