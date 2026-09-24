// Synthesizes the trailer's original, upbeat score as public/score.wav — no
// samples, fully deterministic. 126 BPM, D minor (i–VI–III–VII).
//
// The groove runs on one continuous bar grid through the story act (from 10s)
// and another through the walkthrough (from the title drop at 57s); sections
// only change the arrangement (layers, lead on/off), never restart the beat.
// Section boundaries mirror SCENES in src/LaunchTrailer.tsx:
//   0 cold open · 10 broccoli · 24 two questions · 34 pressure · 46 gap (build)
//   57 TITLE DROP · 64 import · 75 discover · 92 target · 104 research
//   121 decide · 136 converse · 148 breakdown · 156 build · 165 FINAL DROP · 174
//
//   node scripts/generate-score.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const LEN = 174;
const N = SR * LEN;
const BPM = 126;
const B = 60 / BPM;

// buses: music (sidechain-ducked by the kick), drums, reverb send
const ML = new Float32Array(N);
const MR = new Float32Array(N);
const DL = new Float32Array(N);
const DR = new Float32Array(N);
const SL = new Float32Array(N);
const SRv = new Float32Array(N);
const DUCK = new Float32Array(N).fill(1);

let seed = 0x7a11e5;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const TN = 8192;
const TBL = new Float32Array(TN).map((_, i) => Math.sin((2 * Math.PI * i) / TN));
const S = (cycles) => TBL[((cycles * TN) | 0) & (TN - 1)];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const idx = (t) => Math.floor(t * SR);

function put(bus, i, l, r, send) {
  if (i < 0 || i >= N) return;
  if (bus === 'M') {
    ML[i] += l;
    MR[i] += r;
  } else {
    DL[i] += l;
    DR[i] += r;
  }
  SL[i] += l * send;
  SRv[i] += r * send;
}

/* ---------------- synth voice ---------------- */

/**
 * Additive saw-ish voice with a filter envelope (harmonic weights crossfade
 * from `open` to `closed` rolloff at rate `fdec`).
 */
function voice(t, dur, m, amp, o = {}) {
  const { atk = 0.005, rel = 0.08, decay = 0, harm = 8, open = 1.1, closed = 1.1, fdec = 0, detune = [0], pan = 0, bus = 'M', send = 0.3 } = o;
  const s0 = idx(t);
  const n = Math.floor((dur + rel) * SR);
  for (const det of detune) {
    const f = mtof(m + det);
    const H = [];
    for (let h = 1; h <= harm && f * h < 12000; h++) H.push(h);
    const wo = H.map((h) => 1 / h ** open);
    const wc = H.map((h) => 1 / h ** closed);
    const ph0 = rnd();
    const inc = f / SR;
    const vpan = pan + (detune.length > 1 ? det * 2 : 0);
    const gl = (0.5 - vpan / 2) * (amp / detune.length);
    const gr = (0.5 + vpan / 2) * (amp / detune.length);
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      let env = tt < atk ? tt / atk : 1;
      if (decay) env *= Math.exp(-(tt - Math.min(tt, atk)) * decay);
      if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / rel);
      if (env <= 0) continue;
      const fm = fdec ? Math.exp(-tt * fdec) : 0;
      const ph = ph0 + inc * i;
      let v = 0;
      for (let k = 0; k < H.length; k++) v += S(ph * H[k]) * (wc[k] + (wo[k] - wc[k]) * fm);
      v *= env;
      put(bus, s0 + i, v * gl, v * gr, send);
    }
  }
}

/** Karplus–Strong bell / piano-ish pluck. */
function pluck(t, m, amp, { decay = 0.996, len = 1.6, pan = 0, send = 0.45, bright = 0.5 } = {}) {
  const p = Math.max(2, Math.round(SR / mtof(m)));
  const buf = new Float32Array(p);
  let prevN = 0;
  for (let i = 0; i < p; i++) {
    buf[i] = (rnd() * 2 - 1) * bright + prevN * (1 - bright);
    prevN = buf[i];
  }
  const s0 = idx(t);
  const n = Math.floor(len * SR);
  let j = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const y = buf[j];
    buf[j] = decay * 0.5 * (y + prev);
    prev = y;
    j = (j + 1) % p;
    const env = Math.min(1, i / 60) * (i > n - 2000 ? (n - i) / 2000 : 1);
    put('M', s0 + i, y * amp * env * (0.5 - pan / 2), y * amp * env * (0.5 + pan / 2), send);
  }
}

/* ---------------- drums ---------------- */

function duck(t, depth = 0.62, len = 0.3) {
  const s0 = idx(t);
  const n = Math.floor(len * SR);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const x = i / n;
    const sm = x * x * (3 - 2 * x);
    const g = 1 - depth * (1 - sm);
    if (s0 + i >= 0 && g < DUCK[s0 + i]) DUCK[s0 + i] = g;
  }
}

function kick(t, amp = 1) {
  const s0 = idx(t);
  let ph = 0;
  for (let i = 0; i < 0.38 * SR; i++) {
    const tt = i / SR;
    ph += (48 + 115 * Math.exp(-tt * 34)) / SR;
    let v = S(ph) * Math.exp(-tt * 8.5);
    if (i < 140) v += (rnd() * 2 - 1) * 0.5 * (1 - i / 140);
    v = Math.tanh(v * 1.6) * amp;
    put('D', s0 + i, v, v, 0.02);
  }
  duck(t);
}

function bandNoise(t, len, amp, { lo = 0.35, hi = 0.05, decay = 20, pan = 0, send = 0.25, shape } = {}) {
  const s0 = idx(t);
  let a = 0;
  let b = 0;
  for (let i = 0; i < len * SR; i++) {
    const tt = i / SR;
    const n = rnd() * 2 - 1;
    a += (n - a) * lo;
    b += (a - b) * hi;
    const env = shape ? shape(tt) : Math.exp(-tt * decay);
    const v = (a - b) * env * amp;
    put('D', s0 + i, v * (0.5 - pan / 2), v * (0.5 + pan / 2), send);
  }
}

function clap(t, amp = 0.8) {
  for (let k = 0; k < 3; k++) bandNoise(t + k * 0.011, 0.012, amp * 1.2, { lo: 0.4, hi: 0.06, decay: 0, send: 0.2 });
  bandNoise(t + 0.033, 0.18, amp, { lo: 0.4, hi: 0.06, decay: 22, send: 0.35 });
}

function hat(t, open = false, amp = 0.25, pan = 0.25) {
  bandNoise(t, open ? 0.3 : 0.06, amp, { lo: 0.95, hi: 0.5, decay: open ? 11 : 55, pan, send: 0.06 });
}

function snare(t, amp = 0.6) {
  const s0 = idx(t);
  let ph = 0;
  for (let i = 0; i < 0.12 * SR; i++) {
    const tt = i / SR;
    ph += 190 / SR;
    const v = S(ph) * Math.exp(-tt * 28) * amp * 0.7;
    put('D', s0 + i, v, v, 0.2);
  }
  bandNoise(t, 0.22, amp, { lo: 0.55, hi: 0.08, decay: 16, send: 0.3 });
}

function crash(t, amp = 0.5) {
  bandNoise(t, 2.6, amp, { lo: 0.97, hi: 0.35, decay: 1.5, send: 0.35 });
  const s0 = idx(t);
  const partials = [3120, 4570, 6230, 7410];
  for (let i = 0; i < 1.6 * SR; i++) {
    const tt = i / SR;
    let v = 0;
    for (const p of partials) v += S((p * i) / SR);
    v *= 0.02 * amp * Math.exp(-tt * 2.2);
    put('D', s0 + i, v, v, 0.3);
  }
}

/** Reverse cymbal: noise swelling into a cut, ending exactly at `t1`. */
function reverseSwell(t0, t1, amp = 0.4) {
  const len = t1 - t0;
  bandNoise(t0, len, amp, { lo: 0.9, hi: 0.2, send: 0.45, shape: (tt) => (tt / len) ** 3 });
}

function impact(t, amp = 1) {
  const s0 = idx(t);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < 4 * SR; i++) {
    const tt = i / SR;
    ph += (30 + 45 * Math.exp(-tt * 3)) / SR;
    lp += (rnd() * 2 - 1 - lp) * 0.08;
    const v = (S(ph) * Math.exp(-tt * 1.2) * 0.95 + lp * Math.exp(-tt * 1.8) * 1.2) * amp;
    put('D', s0 + i, v, v, 0.3);
  }
}

function riser(t0, t1, amp = 0.5) {
  const s0 = idx(t0);
  const s1 = idx(t1);
  let lp = 0;
  let ph = 0;
  for (let i = s0; i < s1; i++) {
    const p = (i - s0) / (s1 - s0);
    lp += (rnd() * 2 - 1 - lp) * (0.01 + 0.35 * p * p);
    ph += (180 + 1100 * p * p) / SR;
    const v = (lp * 0.9 + S(ph) * 0.14) * amp * p ** 2.2;
    put('D', i, v * (1 - p * 0.3), v * (0.7 + p * 0.3), 0.4);
  }
}

/* ---------------- music ---------------- */

const PROG = ['Dm', 'Bb', 'F', 'C'];
const PAD = { Dm: [50, 57, 62, 65, 69], Bb: [46, 53, 58, 62, 65], F: [41, 48, 57, 60, 65], C: [48, 55, 60, 64, 67] };
const ROOT = { Dm: 38, Bb: 34, F: 41, C: 36 };
const ARP = { Dm: [62, 65, 69, 74], Bb: [62, 65, 70, 74], F: [60, 65, 69, 72], C: [60, 64, 67, 72] };
const LEAD = {
  Dm: [74, -1, 72, 74, 77, -1, 76, 74],
  Bb: [74, -1, 72, 70, 69, -1, 70, 72],
  F: [72, -1, 69, 72, 77, -1, 76, 72],
  C: [76, -1, 74, 72, 67, -1, 69, 72],
};

const padChord = (t, dur, name, amp) => PAD[name].forEach((m) => voice(t, dur, m, amp, { atk: 0.02, rel: 0.25, harm: 7, open: 1.35, closed: 1.35, detune: [-0.12, 0, 0.12], send: 0.35 }));
const bassNote = (t, m, amp) => voice(t, B * 0.42, m, amp, { atk: 0.003, rel: 0.03, harm: 12, open: 0.95, closed: 2.1, fdec: 22, send: 0.02 });
const arpNote = (t, m, amp, bright, pan) => voice(t, B * 0.2, m, amp, { atk: 0.002, rel: 0.09, harm: 10, open: bright, closed: bright + 1, fdec: 18, pan, send: 0.35 });
const leadNote = (t, m, amp) => voice(t, B * 0.42, m, amp, { atk: 0.006, rel: 0.12, harm: 12, open: 0.95, closed: 1.5, fdec: 5, detune: [-0.08, 0.08], send: 0.4 });

/**
 * Groove from t0 to t1 on a bar grid anchored at `anchor` (defaults to t0), so
 * consecutive sections sharing an anchor continue the same beat seamlessly.
 */
function groove(t0, t1, o = {}) {
  const {
    kickEvery = 1, clapOn = [1, 3], ohat = true, chat = true, bass = true, pads = true,
    arp = true, arpBright = 1.1, arpAmp = 0.11, lead = false, padAmp = 0.1, kickAmp = 1, anchor = t0,
  } = o;
  const eps = 1e-3;
  for (let bar = Math.max(0, Math.floor((t0 - anchor + eps) / (4 * B))); ; bar++) {
    const tb = anchor + bar * 4 * B;
    if (tb >= t1 - eps) break;
    const name = PROG[bar % 4];
    const ps = Math.max(tb, t0);
    if (pads) padChord(ps, Math.min(tb + 4 * B, t1) - ps - 0.05, name, padAmp);
    for (let beat = 0; beat < 4; beat++) {
      const tt = tb + beat * B;
      if (tt >= t1 - eps) break;
      if (tt < t0 - eps) continue;
      const fill = false;
      if (!fill && kickEvery && beat % kickEvery === 0) kick(tt, kickAmp);
      if (!fill && clapOn.includes(beat)) clap(tt, 0.75);
      if (!fill && ohat) hat(tt + B / 2, true, 0.16, 0.2);
      if (!fill && chat) for (let s = 0; s < 4; s++) if (s !== 2) hat(tt + (s * B) / 4, false, s === 0 ? 0.1 : 0.06, -0.25);
      if (!fill && bass) {
        bassNote(tt + B / 2, ROOT[name], 0.5);
        if (beat === 3) bassNote(tt + (3 * B) / 4, ROOT[name] + 12, 0.28);
      }
      if (arp)
        for (let s = 0; s < 4; s++) {
          const step = beat * 4 + s;
          const m = ARP[name][[0, 1, 2, 3, 1, 2, 3, 2][step % 8]] + (bar % 2 ? 12 : 0);
          arpNote(tt + (s * B) / 4, m, arpAmp * (s === 0 ? 1.2 : 1), arpBright, s % 2 ? 0.35 : -0.35);
        }
      if (lead && !fill)
        for (let e = 0; e < 2; e++) {
          const m = LEAD[name][beat * 2 + e];
          if (m > 0) leadNote(tt + (e * B) / 2, m, 0.13);
        }
    }
  }
}

/* ---------------- arrangement ---------------- */

// 0–10 cold open: atmosphere only
voice(0, 10, 38, 0.22, { atk: 4, rel: 1, harm: 5, open: 2, closed: 2, detune: [-0.03, 0.03], send: 0.6 });
voice(0, 10, 45, 0.14, { atk: 5, rel: 1, harm: 5, open: 2, closed: 2, detune: [-0.03, 0.03], send: 0.6 });
PAD.Dm.forEach((m) => voice(4, 6, m, 0.05, { atk: 3, rel: 0.5, harm: 5, open: 1.8, closed: 1.8, detune: [-0.1, 0.1], send: 0.6 }));
pluck(0.6, 74, 0.08, { decay: 0.999, len: 4, send: 0.8, bright: 0.3 });
pluck(5.4, 69, 0.08, { decay: 0.999, len: 4, send: 0.8, bright: 0.3 });
reverseSwell(8, 10, 0.35);

// Story act: one continuous grid from 10s; layers stack up section by section
const STORY = 10;
// 10–24 broccoli: pulse — hats, bass, dark arp, kick on the one
groove(10, 24, { anchor: STORY, kickEvery: 4, clapOn: [], ohat: false, arpBright: 2.2, arpAmp: 0.08, padAmp: 0.07, kickAmp: 0.8 });
// 24–34 two questions: half-time
groove(24, 34, { anchor: STORY, kickEvery: 2, clapOn: [2], ohat: false, arpBright: 1.8, arpAmp: 0.09, padAmp: 0.08 });
// 34–46 pressure: four on the floor, still filtered
// the build starts on the first downbeat at/after the 46s cut, so the grid never breaks
const BUILD_BAR = Math.ceil((46 - STORY - 1e-3) / (4 * B));
const BUILD = STORY + BUILD_BAR * 4 * B;
groove(34, BUILD, { anchor: STORY, clapOn: [1, 3], arpBright: 1.5, arpAmp: 0.1, padAmp: 0.09 });
// 46–57 the gap: build — snare roll accelerating, riser, then a breath of silence
{
  const end = 56.7;
  const firstBar = BUILD_BAR;
  for (let bar = 0; ; bar++) {
    const tb = STORY + (firstBar + bar) * 4 * B;
    if (tb >= end) break;
    const name = bar < 2 ? 'Bb' : 'C';
    padChord(tb, Math.min(4 * B, end - tb), name, 0.09 + bar * 0.01);
    for (let s = 0; s < 16; s++) {
      const tt = tb + (s * B) / 4;
      if (tt >= end) break;
      const p = (tt - 46) / (end - 46);
      if (s % 4 === 0) kick(tt, 0.85);
      const div = p < 0.35 ? 4 : p < 0.7 ? 2 : 1; // quarters → 8ths → 16ths
      if (s % div === 0) snare(tt, 0.12 + 0.45 * p * p);
      arpNote(tt, ARP[name][s % 4] + 12, 0.07 + 0.06 * p, 2 - p, s % 2 ? 0.3 : -0.3);
    }
  }
  riser(51, end, 0.6);
}

// 57 TITLE DROP
impact(57, 1);
crash(57, 0.7);
// Title + product walkthrough: one continuous groove from the drop; sections
// only toggle the lead hook
const DROP = 57;
[
  [57, 64, true],
  [64, 92, false],
  [92, 104, true],
  [104, 121, false],
  [121, 148, true],
].forEach(([t0, t1, lead]) => groove(t0, t1, { anchor: DROP, lead, padAmp: t0 === 57 ? 0.12 : 0.11 }));

// 148–156 breakdown: drums out, pads + piano
crash(148, 0.35);
[['Bb', 148], ['F', 150], ['C', 152], ['Dm', 154]].forEach(([name, t]) => padChord(t, 2 - 0.05, name, 0.08));
[[148.4, 81], [150.3, 77], [152.2, 79], [154.1, 74]].forEach(([t, m]) => pluck(t, m, 0.06, { decay: 0.999, len: 3, send: 0.8, bright: 0.28 }));
for (let s = 0; s < 64; s++) arpNote(148 + (s * B) / 4, ARP[PROG[Math.floor(s / 16) % 4]][s % 4] + 12, 0.04, 2.4, s % 2 ? 0.3 : -0.3);

// 156–165 build into the final drop
{
  const end = 164.75;
  for (let s = 0; ; s++) {
    const tt = 156 + (s * B) / 4;
    if (tt >= end) break;
    const p = (tt - 156) / (end - 156);
    const name = p < 0.5 ? 'F' : 'C';
    if (s % 16 === 0) padChord(tt, Math.min(4 * B, end - tt), name, 0.09 + 0.05 * p);
    if (s % 4 === 0) kick(tt, 0.9);
    if (s % 8 === 2 || s % 8 === 6) bassNote(tt, ROOT[name], 0.45);
    const div = p < 0.3 ? 4 : p < 0.65 ? 2 : 1;
    if (s % div === 0) snare(tt, 0.1 + 0.5 * p * p);
    arpNote(tt, ARP[name][s % 4] + 12, 0.07 + 0.07 * p, 1.9 - 0.9 * p, s % 2 ? 0.3 : -0.3);
  }
  riser(160.5, end, 0.6);
}

// 165 FINAL DROP — 3 bars of full groove, then a last stab that rings out
impact(165, 1);
crash(165, 0.75);
groove(165, 165 + 12 * B, { lead: true, padAmp: 0.12 });
{
  const t = 165 + 12 * B;
  kick(t, 1.1);
  crash(t, 0.6);
  impact(t, 0.5);
  PAD.Dm.forEach((m) => voice(t, 2.5, m, 0.13, { atk: 0.01, rel: 2.5, harm: 8, open: 1.2, closed: 1.2, detune: [-0.12, 0, 0.12], send: 0.6 }));
  voice(t, 2.5, 26, 0.35, { atk: 0.01, rel: 2.5, harm: 6, open: 1.4, closed: 1.4, send: 0.2 });
  pluck(t + 0.02, 86, 0.08, { decay: 0.9995, len: 5, send: 0.9, bright: 0.3 });
}

/* ---------------- reverb ---------------- */
function reverb(inp, offset) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.12;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.65 + c.lp * 0.35;
      c.buf[c.i] = x + c.lp * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      const v = -y * 0.5 + b;
      a.buf[a.i] = y + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = v;
    }
    out[n] = y;
  }
  return out;
}
const rvL = reverb(SL, 0);
const rvR = reverb(SRv, 23);

/* ---------------- master ---------------- */
const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = DL[i] + ML[i] * DUCK[i] + rvL[i] * 0.8;
  R[i] = DR[i] + MR[i] * DUCK[i] + rvR[i] * 0.8;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 1.5 / peak;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const fade = i > N - SR * 1.5 ? (N - i) / (SR * 1.5) : 1;
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * gain) * 0.89 * fade * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * gain) * 0.89 * fade * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'public'), { recursive: true });
const raw = resolve(root, 'public/score.raw.wav');
const dest = resolve(root, 'public/score.wav');
writeFileSync(raw, Buffer.concat([header, pcm]));
// Trailer loudness: -14 LUFS integrated, -1 dBTP ceiling.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1:LRA=9', '-ar', String(SR), dest]);
rmSync(raw);
console.log('wrote', dest, `(${LEN}s @ ${BPM} BPM)`);
