"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function responseCurve(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.055) return 0;
  const normalized = (magnitude - 0.055) / 0.945;
  return Math.sign(value) * (0.18 * normalized + 0.82 * Math.pow(normalized, 1.42));
}

export default function VirtualJoystick({ onChange, disabled = false }) {
  const zoneRef = useRef(null);
  const pointerRef = useRef(null);
  const anchorRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const emit = (dx, dy, radius) => {
    onChange?.(responseCurve(dx / radius), responseCurve(-dy / radius));
  };

  const update = (event) => {
    const zone = zoneRef.current;
    const anchorPoint = anchorRef.current;
    if (!zone || !anchorPoint) return;
    const rect = zone.getBoundingClientRect();
    const radius = clamp(Math.min(rect.width, rect.height) * 0.21, 52, 72);
    let dx = event.clientX - rect.left - anchorPoint.x;
    let dy = event.clientY - rect.top - anchorPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }
    setKnob({ x: dx, y: dy });
    emit(dx, dy, radius);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <div
      ref={zoneRef}
      className={`joystick-zone ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
      role="application"
      aria-label="Flight steering"
      onPointerDown={(event) => {
        if (disabled || pointerRef.current !== null) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const safe = clamp(Math.min(rect.width, rect.height) * 0.24, 66, 90);
        const nextAnchor = {
          x: clamp(event.clientX - rect.left, safe, Math.max(safe, rect.width - safe)),
          y: clamp(event.clientY - rect.top, safe, Math.max(safe, rect.height - safe)),
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
        <span className="joystick-axis horizontal" />
        <span className="joystick-axis vertical" />
        <span className="joystick-orbit outer" />
        <span className="joystick-orbit inner" />
        <div className="joystick-knob" style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }}>
          <span />
        </div>
      </div>
    </div>
  );
}
