// Background music: original chiptune tracks synthesized with the Web Audio API (no audio files).
// - 'home'   : calm, waiting-room feel (C major, 92 BPM, soft pulse lead, gentle arpeggio, no drums)
// - 'battle' : driving battle theme (A minor, 152 BPM, octave bass, 16th arpeggio, drums)
// - 'win' / 'lose' : short one-shot jingles for the result screen
// The score is plain data so it can be checked from Node tests (no DOM / AudioContext at import).

const STEPS_PER_BAR = 16; // 16th-note grid

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus4: [0, 5, 7] };
export function chordTones(name) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const q = m && QUALITY[m[3]];
  if (!q) throw new Error('bad chord ' + name);
  const root = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return q.map((i) => root + i); // pitch classes relative to C (may exceed 11)
}

// "E5:4 r:2 C5:2" -> [{note, len}] ; "Am:8 D7:8" -> [{chord, len}]
function parseSeq(bar) {
  return bar.trim().split(/\s+/).map((tok) => { const [n, l] = tok.split(':'); return { n, len: +l }; });
}

// ---------------- the score ----------------
// Each bar is 16 steps (16th notes). Melody tokens: NOTE:steps, r = rest.
const SCORE = {
  home: {
    bpm: 92,
    chords: [
      'Fmaj7:16', 'Em7:16', 'Dm7:16', 'G:16', 'Fmaj7:16', 'Em7:16', 'Am7:8 D7:8', 'Gsus4:8 G:8',
      'Am:16', 'F:16', 'C:16', 'G:16', 'Am:16', 'F:16', 'Dm7:16', 'G7:16',
    ],
    lead: [
      'E5:6 D5:2 C5:4 A4:4', 'B4:6 C5:2 D5:4 G4:4', 'A4:6 C5:2 F5:4 E5:2 D5:2', 'D5:12 r:4',
      'E5:6 D5:2 C5:4 E5:4', 'G5:6 F5:2 E5:4 D5:2 B4:2', 'C5:6 E5:2 D5:4 F#5:4', 'G5:8 F5:2 E5:2 D5:4',
      'C5:4 E5:4 A5:6 G5:2', 'F5:8 E5:4 C5:4', 'E5:6 G5:2 E5:4 C5:4', 'D5:12 r:4',
      'C5:4 E5:4 A5:4 B5:4', 'C6:8 A5:4 F5:4', 'F5:6 E5:2 D5:4 A4:4', 'B4:6 C5:2 D5:8',
    ],
  },
  battle: {
    bpm: 152,
    chords: [
      'Am:16', 'Am:16', 'F:16', 'G:16', 'Am:16', 'Am:16', 'F:16', 'E:16',
      'Dm:16', 'Am:16', 'F:16', 'E:16', 'Dm:16', 'Am:16', 'F:8 G:8', 'E:16',
    ],
    lead: [
      'A4:2 r:1 A4:1 C5:2 E5:2 A5:4 G5:2 E5:2', 'F5:2 E5:2 D5:2 C5:2 D5:4 E5:4',
      'C5:2 r:1 C5:1 F5:2 A5:2 G5:4 F5:2 E5:2', 'D5:6 B4:2 G4:4 B4:4',
      'A4:2 r:1 A4:1 C5:2 E5:2 A5:4 B5:2 C6:2', 'B5:2 A5:2 G5:2 E5:2 A5:8',
      'F5:2 G5:2 A5:2 F5:2 C6:4 A5:4', 'G#5:4 B5:4 E5:4 G#4:4',
      'D5:4 F5:4 A5:6 G5:2', 'E5:8 C5:4 A4:4', 'F5:4 A5:4 C6:6 B5:2', 'B5:8 G#5:4 E5:4',
      'D6:4 C6:2 A5:2 F5:4 A5:4', 'C6:4 B5:2 A5:2 E5:8', 'F5:2 A5:2 C6:4 B5:2 G5:2 D6:4',
      'B5:2 G#5:2 E5:2 G#5:2 B5:2 D6:2 E6:4',
    ],
  },
  win: { bpm: 168, once: true, lead: ['C5:1 E5:1 G5:1 C6:1 r:2 G5:1 C6:1 E6:7 r:1', 'r:16'], chords: ['C:16', 'C:16'] },
  lose: { bpm: 84, once: true, lead: ['A4:4 G4:4 F4:4 E4:4', 'E4:12 r:4'], chords: ['Am:16', 'E:16'] },
};

// Instruments: wave, volume, envelope (s), sustain level, vibrato (cents)
const INST = {
  homeLead:   { wave: 'pulse12', vol: 0.15, a: 0.02,  d: 0.25, s: 0.6,  r: 0.25, vib: 12 },
  homeArp:    { wave: 'pulse25', vol: 0.045, a: 0.005, d: 0.18, s: 0.25, r: 0.12 },
  homeBass:   { wave: 'triangle', vol: 0.26, a: 0.01, d: 0.4,  s: 0.7,  r: 0.2 },
  battleLead: { wave: 'pulse50', vol: 0.11, a: 0.005, d: 0.12, s: 0.7,  r: 0.06, vib: 10 },
  battleArp:  { wave: 'pulse12', vol: 0.04, a: 0.002, d: 0.06, s: 0.2,  r: 0.03 },
  battleBass: { wave: 'triangle', vol: 0.32, a: 0.003, d: 0.08, s: 0.8,  r: 0.03 },
  jingle:     { wave: 'pulse25', vol: 0.14, a: 0.005, d: 0.15, s: 0.6,  r: 0.2, vib: 8 },
  jingleBass: { wave: 'triangle', vol: 0.26, a: 0.005, d: 0.3,  s: 0.7,  r: 0.2 },
};

// Chord list for one bar -> [{tones, step, len}]
function chordSegments(chords) {
  const out = [];
  chords.forEach((bar, bi) => { let s = 0; for (const { n, len } of parseSeq(bar)) { out.push({ tones: chordTones(n), step: bi * STEPS_PER_BAR + s, len }); s += len; } });
  return out;
}
// pitch class (0-11+) placed in a given octave
const pc = (p, oct) => 12 * (oct + 1) + p;

// Compile a score into a step -> events table.
export function compileTrack(name) {
  const sc = SCORE[name];
  const bars = sc.lead.length;
  const length = bars * STEPS_PER_BAR;
  const events = Array.from({ length }, () => []);
  const add = (step, ev) => events[step % length].push(ev);
  const segs = chordSegments(sc.chords);
  const kind = name === 'home' ? 'home' : name === 'battle' ? 'battle' : 'jingle';

  // melody
  sc.lead.forEach((bar, bi) => {
    let s = 0;
    for (const { n, len } of parseSeq(bar)) {
      if (n !== 'r') add(bi * STEPS_PER_BAR + s, { inst: kind === 'jingle' ? 'jingle' : kind + 'Lead', midi: midi(n), len: len * 0.95 });
      s += len;
    }
  });

  for (const seg of segs) {
    const root = seg.tones[0] % 12;
    if (kind === 'home') {
      // bass: root, then the fifth halfway through a long chord
      add(seg.step, { inst: 'homeBass', midi: pc(root, 2), len: Math.min(seg.len, 8) - 1 });
      if (seg.len >= 16) add(seg.step + 8, { inst: 'homeBass', midi: pc(root, 2) + 7, len: 7 });
      // gentle 8th-note arpeggio going up and down the chord
      const up = seg.tones.map((p) => pc(p % 12, 4)).sort((a, b) => a - b);
      const cyc = [...up, pc(root, 5), ...up.slice(1).reverse()];
      for (let i = 0; i < seg.len / 2; i++) add(seg.step + i * 2, { inst: 'homeArp', midi: cyc[i % cyc.length], len: 2 });
      // soft shaker on the off-beats
      for (let i = 2; i < seg.len; i += 4) add(seg.step + i, { drum: 'shaker' });
    } else if (kind === 'battle') {
      // driving octave bass in 8ths
      for (let i = 0; i < seg.len; i += 2) add(seg.step + i, { inst: 'battleBass', midi: pc(root, 2) + (i % 4 === 2 ? 12 : 0), len: 1.4 });
      // fast 16th arpeggio
      const tri = seg.tones.slice(0, 3).map((p) => pc(p % 12, 4)).sort((a, b) => a - b);
      const cyc = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2], tri[1]];
      for (let i = 0; i < seg.len; i++) add(seg.step + i, { inst: 'battleArp', midi: cyc[i % cyc.length], len: 0.8 });
    } else {
      add(seg.step, { inst: 'jingleBass', midi: pc(root, 2), len: Math.min(seg.len, 12) });
    }
  }

  if (kind === 'battle') {
    const beat = 'K.h.S.h.K.KhS.hh';  // kick / snare / hat on the 16th grid
    const fill = 'K.h.S.h.K.KhSSSS';  // snare roll leading into the next phrase
    for (let b = 0; b < bars; b++) {
      const pat = b % 8 === 7 ? fill : beat;
      [...pat].forEach((ch, i) => { if (ch !== '.') add(b * STEPS_PER_BAR + i, { drum: { K: 'kick', S: 'snare', h: 'hat' }[ch] }); });
      if (b % 8 === 0) add(b * STEPS_PER_BAR, { drum: 'crash' });
    }
  }
  return { name, bpm: sc.bpm, once: !!sc.once, length, events, stepSec: 60 / sc.bpm / 4 };
}

export const TRACK_NAMES = Object.keys(SCORE);
export const SCORE_DATA = SCORE; // for tests
export const STEPS = STEPS_PER_BAR;
export function barLengths(seqBars) { return seqBars.map((b) => parseSeq(b).reduce((a, x) => a + x.len, 0)); }

// ---------------- player ----------------
const LOOKAHEAD = 0.2;   // seconds scheduled ahead
const TICK_MS = 25;

export class Bgm {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.desired = null;   // track that should be playing (kept while muted / before unlock)
    this.cur = null;       // { name, track, bus, step, next }
    this.timer = 0; this.jingleTimer = 0;
    this.tracks = {};
  }
  get current() { return this.cur ? this.cur.name : null; }
  get unlocked() { return !!this.ctx && this.ctx.state === 'running'; }

  // Must be called from a user gesture (mobile browsers block audio until then).
  unlock() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this._setup(new AC());
    if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume();
    if (this.enabled && this.desired && !this.cur) this._start(this.desired);
  }
  _setup(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.waves = {};
    for (const [k, d] of [['pulse12', 0.125], ['pulse25', 0.25], ['pulse50', 0.5]]) this.waves[k] = this.pulseWave(d);
    const len = ctx.sampleRate; const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  // Render `seconds` of a track into an AudioBuffer (for tests / previews; no real-time playback).
  static async render(name, seconds, sampleRate = 44100) {
    const b = new Bgm(); b._setup(new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate));
    const tr = b._track(name);
    for (let i = 0, t = 0; t < seconds; i++, t += tr.stepSec) {
      if (tr.once && i >= tr.length) break;
      for (const ev of tr.events[i % tr.length]) {
        if (ev.drum) b._drum(b.master, ev.drum, t); else b._note(b.master, INST[ev.inst], ev.midi, t, ev.len * tr.stepSec);
      }
    }
    return b.ctx.startRendering();
  }
  pulseWave(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
    return this.ctx.createPeriodicWave(re, im);
  }

  play(name) {
    clearTimeout(this.jingleTimer);
    this.desired = name;
    if (this.cur && this.cur.name === name) return;
    if (!this.enabled || !this.ctx) return;
    this._start(name);
  }
  // Play a one-shot jingle, then continue with `after`.
  jingle(name, after) {
    clearTimeout(this.jingleTimer);
    this.desired = after;
    if (!this.enabled || !this.ctx) return;
    const tr = this._start(name, 0.25);
    this.jingleTimer = setTimeout(() => { if (this.cur && this.cur.name === name) this._start(after); }, (tr.length * tr.stepSec + 0.6) * 1000);
  }
  setEnabled(on) {
    this.enabled = on;
    if (!on) { clearTimeout(this.jingleTimer); this._stop(0.3); } else if (this.ctx && this.desired) { this.unlock(); this._start(this.desired); }
  }
  // Page hidden (app switched / screen locked): pause everything.
  setHidden(hidden) {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend(); else if (this.enabled) this.ctx.resume();
  }

  _track(name) { return this.tracks[name] || (this.tracks[name] = compileTrack(name)); }
  _start(name, fadeOut = 0.6) {
    this._stop(fadeOut);
    const ctx = this.ctx, track = this._track(name);
    const bus = ctx.createGain(); bus.connect(this.master);
    const t0 = ctx.currentTime + 0.06;
    bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, t0 + (track.once ? 0.02 : 0.5));
    this.cur = { name, track, bus, step: 0, next: t0 };
    this.timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
    return track;
  }
  _stop(fade = 0.5) {
    clearInterval(this.timer); this.timer = 0;
    const c = this.cur; if (!c) return;
    this.cur = null;
    const t = this.ctx.currentTime;
    c.bus.gain.cancelScheduledValues(t); c.bus.gain.setValueAtTime(c.bus.gain.value, t); c.bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => c.bus.disconnect(), (fade + LOOKAHEAD + 1.5) * 1000);
  }
  _tick() {
    const c = this.cur; if (!c) return;
    const { track } = c, ctx = this.ctx;
    while (c.next < ctx.currentTime + LOOKAHEAD) {
      if (c.done) return;
      for (const ev of track.events[c.step]) {
        if (ev.drum) this._drum(c.bus, ev.drum, c.next);
        else this._note(c.bus, INST[ev.inst], ev.midi, c.next, ev.len * track.stepSec);
      }
      c.next += track.stepSec;
      c.step++;
      if (c.step >= track.length) { if (track.once) { c.done = true; return; } c.step = 0; }
    }
  }
  _note(bus, inst, m, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (this.waves[inst.wave]) o.setPeriodicWave(this.waves[inst.wave]); else o.type = inst.wave;
    o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    const g = ctx.createGain(); const v = inst.vol;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + inst.a);
    g.gain.setTargetAtTime(v * inst.s, t + inst.a, inst.d / 3);
    g.gain.setTargetAtTime(0, t + Math.max(dur, inst.a), inst.r / 3);
    o.connect(g).connect(bus);
    const end = t + dur + inst.r + 0.05;
    if (inst.vib && dur > 0.3) {          // delayed vibrato on long notes
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(inst.vib, t + Math.min(0.35, dur));
      lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(end);
    }
    o.start(t); o.stop(end);
  }
  _drum(bus, kind, t) {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
      return;
    }
    const conf = { snare: [1400, 'highpass', 0.22, 0.12], hat: [7000, 'highpass', 0.07, 0.035], crash: [5000, 'highpass', 0.1, 0.6], shaker: [6500, 'bandpass', 0.035, 0.05] }[kind];
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = conf[1]; f.frequency.value = conf[0];
    const g = ctx.createGain(); g.gain.setValueAtTime(conf[2], t); g.gain.exponentialRampToValueAtTime(0.001, t + conf[3]);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + conf[3] + 0.02);
    if (kind === 'snare') {               // body tone
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(og).connect(bus); o.start(t); o.stop(t + 0.1);
    }
  }
}
