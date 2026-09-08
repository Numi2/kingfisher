// Browser scheduling is not a player pause command. Keep this independent of rendering.
export class FlightClock {
  constructor() { this.last = null; this.hidden = false; this.contextLost = false; this.stalls = 0; }
  reset() { this.last = null; }
  get suspended() { return this.hidden || this.contextLost; }
  setHidden(value) { this.hidden = Boolean(value); this.reset(); }
  setContextLost(value) { this.contextLost = Boolean(value); this.reset(); }
  sample(timestamp, running = true) {
    if (!Number.isFinite(timestamp)) return { delta: 0, raw: 0, steps: 0 };
    const raw = this.last === null ? 0 : Math.max(0, (timestamp - this.last) / 1000);
    this.last = timestamp;
    if (!running || this.suspended) return { delta: 0, raw, steps: 0 };
    // Never enqueue a large catch-up workload or charge the hunt clock for a stall.
    const delta = Math.min(raw, 1 / 15);
    if (raw > 1 / 15) this.stalls++;
    return { delta, raw, steps: Math.min(8, Math.ceil(delta * 120)) };
  }
}

const PAD_BINDINGS = { flap: [0], dive: [1, 7], brake: [2, 6], burst: [5], pause: [9] };

// Only standard mappings have known button meanings. Every connection/reconnection
// requires a neutral sample before a held button can become a new action.
export class FlightPadEdges {
  constructor() { this.reset(); this.lastPauseAt = -Infinity; }
  reset() { this.identity = null; this.down = {}; this.armed = {}; this.active = new Set(); }
  sample(pad, now = 0) {
    const events = [];
    const identity = pad?.connected && pad.mapping === 'standard' ? `${pad.index}:${pad.id}` : null;
    const values = {};
    for (const [action, indices] of Object.entries(PAD_BINDINGS)) {
      values[action] = Boolean(identity && indices.some(i => pad.buttons?.[i]?.pressed));
    }
    if (identity !== this.identity) {
      for (const action of this.active) events.push([action, false]);
      this.active.clear(); this.identity = identity;
      for (const action of Object.keys(PAD_BINDINGS)) {
        this.down[action] = values[action]; this.armed[action] = !values[action];
      }
      return events;
    }
    if (!identity) return events;
    for (const action of Object.keys(PAD_BINDINGS)) {
      const down = values[action];
      if (!down) {
        this.armed[action] = true;
        if (this.active.delete(action)) events.push([action, false]);
      } else if (!this.down[action] && this.armed[action]) {
        if (action !== 'pause' || now - this.lastPauseAt >= 300) {
          events.push([action, true]); this.active.add(action);
          if (action === 'pause') this.lastPauseAt = now;
        }
      }
      this.down[action] = down;
    }
    return events;
  }
}
