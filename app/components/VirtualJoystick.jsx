"use client";

import { useEffect, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function curve(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.04) return 0;
  return Math.sign(value) * Math.pow((magnitude - 0.04) / 0.96, 1.08);
}

export default function VirtualJoystick({ onChange, disabled = false }) {
  const zoneRef = useRef(null);
  const pointerRef = useRef(null);
  const anchorRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const update = (event, nextAnchor = anchorRef.current) => {
    const zone = zoneRef.current;
    if (!zone || !nextAnchor) return;
    const rect = zone.getBoundingClientRect();
    const radius = clamp(Math.min(rect.width, rect.height) * 0.17, 44, 58);
    let dx = event.clientX - rect.left - nextAnchor.x;
    let dy = event.clientY - rect.top - nextAnchor.y;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    setKnob({ x: dx, y: dy });
    onChange?.(curve(dx / radius), curve(-dy / radius));
  };

  const release = (event) => {
    if (pointerRef.current !== null && event?.pointerId !== undefined && event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    anchorRef.current = null;
    setActive(false);
    setAnchor(null);
    setKnob({ x: 0, y: 0 });
    onChange?.(0, 0);
  };

  useEffect(() => {
    if (disabled) release();
    return () => onChange?.(0, 0);
    // `release` intentionally uses only refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <div
      ref={zoneRef}
      className={`joystick-zone ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
      role="application"
      aria-label="Floating kingfisher steering control. Drag up to climb, down to descend, and sideways to turn."
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const safeRadius = clamp(Math.min(rect.width, rect.height) * 0.22, 68, 84);
        const nextAnchor = {
          x: clamp(event.clientX - rect.left, safeRadius, Math.max(safeRadius, rect.width - safeRadius)),
          y: clamp(event.clientY - rect.top, safeRadius, Math.max(safeRadius, rect.height - safeRadius)),
        };
        pointerRef.current = event.pointerId;
        anchorRef.current = nextAnchor;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setAnchor(nextAnchor);
        setActive(true);
        setKnob({ x: 0, y: 0 });
        onChange?.(0, 0);
      }}
      onPointerMove={(event) => {
        if (!active || pointerRef.current !== event.pointerId) return;
        event.preventDefault();
        update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div
        className={`joystick-base ${active ? "active" : ""}`}
        style={anchor ? { left: `${anchor.x}px`, top: `${anchor.y}px`, bottom: "auto" } : undefined}
      >
        <div className="joystick-ring" />
        <div className="joystick-label joystick-up">CLIMB</div>
        <div className="joystick-label joystick-turn">TURN</div>
        <div className="joystick-knob" style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }}>
          <span />
        </div>
      </div>
      <div className="joystick-zone-hint">TOUCH + DRAG TO FLY</div>
    </div>
  );
}
