"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function responseCurve(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.025) return 0;
  const normalized = clamp((magnitude - 0.025) / 0.975, 0, 1);
  return Math.sign(value) * (0.52 * normalized + 0.48 * normalized * normalized);
}

export default function VirtualJoystick({ onChange, disabled = false }) {
  const zoneRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const pointerRef = useRef(null);
  const anchorRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [active, setActive] = useState(false);

  const setKnob = (x, y) => {
    if (knobRef.current) knobRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const emit = (dx, dy, radius) => {
    onChange?.(responseCurve(dx / radius), responseCurve(-dy / radius) * 0.92);
  };

  const update = (event) => {
    const zone = zoneRef.current;
    const anchorPoint = anchorRef.current;
    if (!zone || !anchorPoint) return;
    const rect = zone.getBoundingClientRect();
    const radius = clamp(Math.min(rect.width, rect.height) * 0.23, 58, 82);
    let dx = event.clientX - rect.left - anchorPoint.x;
    let dy = event.clientY - rect.top - anchorPoint.y;
    let distance = Math.hypot(dx, dy);

    if (distance > radius * 1.08) {
      const follow = distance - radius;
      anchorPoint.x = clamp(anchorPoint.x + (dx / distance) * follow, radius, Math.max(radius, rect.width - radius));
      anchorPoint.y = clamp(anchorPoint.y + (dy / distance) * follow, radius, Math.max(radius, rect.height - radius));
      setAnchor({ ...anchorPoint });
      dx = event.clientX - rect.left - anchorPoint.x;
      dy = event.clientY - rect.top - anchorPoint.y;
      distance = Math.hypot(dx, dy);
    }

    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }
    setKnob(dx, dy);
    emit(dx, dy, radius);
  };

  const release = (event) => {
    if (pointerRef.current !== null && event?.pointerId !== undefined && event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    anchorRef.current = null;
    setActive(false);
    setAnchor(null);
    setKnob(0, 0);
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
        const safe = clamp(Math.min(rect.width, rect.height) * 0.25, 72, 96);
        const nextAnchor = {
x: clamp(event.clientX - rect.left, safe, Math.max(safe, rect.width - safe)),
y: clamp(event.clientY - rect.top, safe, Math.max(safe, rect.height - safe)),
        };
        pointerRef.current = event.pointerId;
        anchorRef.current = nextAnchor;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setAnchor(nextAnchor);
        setActive(true);
        setKnob(0, 0);
        onChange?.(0, 0);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current !== event.pointerId) return;
        event.preventDefault();
        update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div
        ref={baseRef}
        className={`joystick-base ${active ? "active" : ""}`}
        style={anchor ? { left: `${anchor.x}px`, top: `${anchor.y}px`, bottom: "auto" } : undefined}
      >
        <span className="joystick-axis horizontal" />
        <span className="joystick-axis vertical" />
        <span className="joystick-orbit outer" />
        <span className="joystick-orbit inner" />
        <div ref={knobRef} className="joystick-knob"><span /></div>
      </div>
    </div>
  );
}
