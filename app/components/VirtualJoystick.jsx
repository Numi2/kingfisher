"use client";

import { useEffect, useRef } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function responseCurve(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.028) return 0;
  const normalized = clamp((magnitude - 0.028) / 0.972, 0, 1);
  const shaped = normalized * 0.52 + Math.pow(normalized, 1.65) * 0.48;
  return Math.sign(value) * shaped;
}

export default function VirtualJoystick({ onChange, disabled = false }) {
  const zoneRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const pointerRef = useRef(null);
  const anchorRef = useRef(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const emitPosition = (event) => {
    const zone = zoneRef.current;
    const anchor = anchorRef.current;
    const knob = knobRef.current;
    if (!zone || !anchor || !knob) return;

    const rect = zone.getBoundingClientRect();
    const radius = clamp(Math.min(rect.width, rect.height) * 0.245, 62, 92);
    let dx = event.clientX - rect.left - anchor.x;
    let dy = event.clientY - rect.top - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }

    knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    onChange?.(responseCurve(dx / radius), responseCurve(-dy / radius));
  };

  const release = (event) => {
    if (pointerRef.current !== null && event?.pointerId !== undefined && event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    anchorRef.current = null;
    zoneRef.current?.classList.remove("active");
    baseRef.current?.classList.remove("active");
    if (knobRef.current) knobRef.current.style.transform = "translate3d(0, 0, 0)";
    if (baseRef.current) {
      baseRef.current.style.removeProperty("left");
      baseRef.current.style.removeProperty("top");
      baseRef.current.style.removeProperty("bottom");
    }
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
      className={`joystick-zone ${disabled ? "disabled" : ""}`}
      role="application"
      aria-label="Flight steering"
      onPointerDown={(event) => {
        if (disabledRef.current || pointerRef.current !== null) return;
        event.preventDefault();
        const zone = event.currentTarget;
        const rect = zone.getBoundingClientRect();
        const safe = clamp(Math.min(rect.width, rect.height) * 0.27, 78, 104);
        const anchor = {
          x: clamp(event.clientX - rect.left, safe, Math.max(safe, rect.width - safe)),
          y: clamp(event.clientY - rect.top, safe, Math.max(safe, rect.height - safe)),
        };
        pointerRef.current = event.pointerId;
        anchorRef.current = anchor;
        zone.setPointerCapture?.(event.pointerId);
        zone.classList.add("active");
        if (baseRef.current) {
          baseRef.current.classList.add("active");
          baseRef.current.style.left = `${anchor.x}px`;
          baseRef.current.style.top = `${anchor.y}px`;
          baseRef.current.style.bottom = "auto";
        }
        emitPosition(event);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current !== event.pointerId) return;
        event.preventDefault();
        emitPosition(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={baseRef} className="joystick-base">
        <span className="joystick-axis horizontal" />
        <span className="joystick-axis vertical" />
        <span className="joystick-orbit outer" />
        <span className="joystick-orbit inner" />
        <div ref={knobRef} className="joystick-knob">
          <span />
        </div>
      </div>
    </div>
  );
}
