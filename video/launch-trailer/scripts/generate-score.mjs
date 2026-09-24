// Synthesizes the trailer's original score as public/score.wav — no samples,
// no external assets, fully deterministic. Cut points mirror SCENES in
// src/LaunchTrailer.tsx:
//   0   cold open        10  broccoli     24 two questions   34 pressure
//   46  the gap (riser)  57  TITLE HIT    64 walkthrough drive (… 148)
//   148 breakdown        156 build        165 FINAL HIT       174 end
//
//   node scripts/generate-score.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const LEN = 174;
const N = SR * LEN;
const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);
const TAU = Math.PI * 2;

let seed = 0x7a11e5;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const put = (i, l, r, send = 0) => {
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
  sendL[i] += l * send;
  sendR[i] += r * send;
};

/* ---------------- instruments ---------------- */

/** Warm additive pad; attack/release in seconds. */
function pad(t0, t1, notes, amp, { atk = 2, rel = 2.5, bright = 1.6, send = 0.6 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const s1 = Math.min(N, Math.floor((t1 + rel) * SR));
  notes.forEach((m, ni) => {
    const pan = notes.length > 1 ? (ni / (notes.length - 1)) * 0.8 - 0.4 : 0;
    for (const det of m < 50 ? [-0.015, 0.015] : [-0.06, 0.06]) {
      const f = mtof(m + det);
      const harm = [1, 2, 3, 4, 5].filter((h) => f * h < 5000);
      const ph = harm.map(() => rnd() * TAU);
      const w = harm.map((h) => (TAU * f * h) / SR);
      const g = harm.map((h) => 1 / h ** bright);
      const lfoRate = 0.1 + rnd() * 0.15;
      for (let i = s0; i < s1; i++) {
        const t = i / SR;
        let env = Math.min(1, (t - t0) / atk);
        if (t > t1) env *= Math.max(0, 1 - (t - t1) / rel);
        env = env * env * (3 - 2 * env);
        let v = 0;
        for (let k = 0; k < harm.length; k++) v += Math.sin(ph[k] + w[k] * (i - s0)) * g[k];
        v *= amp * env * (0.85 + 0.15 * Math.sin(TAU * lfoRate * t)) / notes.length;
        put(i, v * (0.5 - pan * 0.5 + (det < 0 ? 0.1 : -0.1)), v * (0.5 + pan * 0.5 + (det > 0 ? 0.1 : -0.1)), send);
      }
    }
  });
}

/** Karplus–Strong pluck (arp / piano-ish bell). */
function pluck(t, m, amp, { decay = 0.996, len = 1.6, pan = 0, send = 0.45, bright = 0.5 } = {}) {
  const f = mtof(m);
  const p = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(p);
  let prevN = 0;
  for (let i = 0; i < p; i++) {
    const n = rnd() * 2 - 1;
    buf[i] = n * bright + prevN * (1 - bright);
    prevN = buf[i];
  }
  const s0 = Math.floor(t * SR);
  const n = Math.floor(len * SR);
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const y = buf[idx];
    const nv = decay * 0.5 * (y + prev);
    prev = y;
    buf[idx] = nv;
    idx = (idx + 1) % p;
    const env = Math.min(1, i / 60) * (i > n - 2000 ? (n - i) / 2000 : 1);
    const v = y * amp * env;
    put(s0 + i, v * (0.5 - pan / 2), v * (0.5 + pan / 2), send);
  }
}

function kick(t, amp = 0.9, { f0 = 120, f1 = 42, len = 0.45 } = {}) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  for (let i = 0; i < len * SR; i++) {
    const tt = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt * 28);
    ph += (TAU * f) / SR;
    const v = Math.sin(ph) * Math.exp(-tt * 7) * amp;
    put(s0 + i, v, v, 0.05);
  }
}

function noiseBurst(t, amp, len, { hp = 0.5, pan = 0, send = 0.1, decay = 30 } = {}) {
  const s0 = Math.floor(t * SR);
  let prev = 0;
  for (let i = 0; i < len * SR; i++) {
    const n = rnd() * 2 - 1;
    const h = n - prev * hp;
    prev = n;
    const v = h * amp * Math.exp((-i / SR) * decay);
    put(s0 + i, v * (0.5 - pan / 2), v * (0.5 + pan / 2), send);
  }
}

/** Cinematic impact: sub drop + lowpassed noise crash + a bright bloom. */
function impact(t, amp = 1) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < 4.5 * SR; i++) {
    const tt = i / SR;
    const f = 30 + 45 * Math.exp(-tt * 3);
    ph += (TAU * f) / SR;
    const sub = Math.sin(ph) * Math.exp(-tt * 1.1) * 0.95;
    lp += (rnd() * 2 - 1 - lp) * 0.08;
    const crash = lp * Math.exp(-tt * 1.6) * 1.6;
    const v = (sub + crash) * amp;
    put(s0 + i, v, v, 0.35);
  }
}

/** Reverse swell into a hit (noise + rising tone), cut sharply at `t1`. */
function riser(t0, t1, amp = 0.5) {
  const s0 = Math.floor(t0 * SR);
  const s1 = Math.floor(t1 * SR);
  let lp = 0;
  let ph = 0;
  for (let i = s0; i < s1; i++) {
    const p = (i - s0) / (s1 - s0);
    const cutoff = 0.01 + 0.35 * p * p;
    lp += (rnd() * 2 - 1 - lp) * cutoff;
    ph += (TAU * (180 + 900 * p * p)) / SR;
    const v = (lp * 0.9 + Math.sin(ph) * 0.12) * amp * p ** 2.2;
    put(i, v * (1 - p * 0.3), v * (0.7 + p * 0.3), 0.4);
  }
}

function whoosh(t, amp = 0.25) {
  const s0 = Math.floor((t - 0.45) * SR);
  let lp = 0;
  const n = Math.floor(0.9 * SR);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const env = Math.sin(Math.PI * p) ** 2;
    lp += (rnd() * 2 - 1 - lp) * (0.04 + 0.2 * env);
    const v = lp * env * amp;
    put(s0 + i, v * (1 - p), v * p, 0.3);
  }
}

/* ---------------- arrangement ---------------- */

const D2 = 38, A2 = 45, D3 = 50, F3 = 53, A3 = 57, C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
const CH = {
  Dm: [D3, A3, D4, F4, A4],
  Bb: [46, 53, 58, 62, 65],
  F: [41, 48, 57, 60, 65],
  C: [48, 55, 60, 64, 67],
  Gm: [43, 50, 58, 62, 67],
  Fadd9: [41, 48, 53, 57, 60, 67],
  Bbmaj7: [46, 53, 57, 62, 65],
};

// Intro drone + slow harmony
pad(0, 24, [D2, A2], 0.2, { atk: 4, bright: 2.2 });
pad(4, 17.5, CH.Dm, 0.22, { atk: 4 });
pad(17, 24.5, CH.Bb, 0.22, { atk: 2 });
pad(24, 34.5, CH.Gm, 0.24, { atk: 2 });
pad(34, 46.5, CH.Dm, 0.26, { atk: 2 });
pad(34, 46, [D2], 0.16, { atk: 2, bright: 3 });
pad(46, 51.5, CH.Bb, 0.28, { atk: 1.5 });
pad(51, 56.8, CH.C, 0.3, { atk: 1.5, rel: 0.2 });
// cold-open bells on each subtitle line
pluck(0.6, D4, 0.1, { decay: 0.9995, len: 5, send: 0.8, bright: 0.3 });
pluck(5.4, A3, 0.1, { decay: 0.9995, len: 5, send: 0.8, bright: 0.3 });
// soft thuds on story cuts
for (const t of [10, 24]) kick(t, 0.55, { f0: 70, f1: 34, len: 1.2 });
// heartbeat under the market-pressure stats
for (let t = 34.2; t < 45.5; t += 1.0) {
  kick(t, 0.4, { f0: 80, f1: 40, len: 0.35 });
  kick(t + 0.22, 0.26, { f0: 70, f1: 38, len: 0.3 });
}
// the gap: ticking pulse then riser into the title
for (let t = 46; t < 56.5; t += 0.3) pluck(t, t < 51 ? A4 : C4 + 12, 0.08 + (t - 46) * 0.008, { decay: 0.98, len: 0.25, pan: Math.sin(t * 5) * 0.5, bright: 0.9 });
riser(51, 56.95, 0.65);

// TITLE HIT
impact(57, 1);
pad(57, 63.5, CH.Fadd9, 0.42, { atk: 0.05, rel: 3, bright: 1.3 });
pluck(57.02, F4 + 12, 0.3, { decay: 0.9993, len: 5, send: 0.8 });

// Walkthrough drive: i–VI–III–VII at 100 BPM
const BEAT = 0.6;
const PROG = ['Dm', 'Bb', 'F', 'C'];
const driveStart = 64;
const driveEnd = 148;
for (let t = driveStart, k = 0; t < driveEnd - 0.1; t += 8 * BEAT, k++) {
  const name = PROG[k % 4];
  pad(t, Math.min(driveEnd, t + 8 * BEAT), CH[name], 0.34, { atk: 0.8, rel: 1.2 });
  // arp
  const tones = CH[name].slice(1).map((m) => m + 12);
  const pattern = [0, 1, 2, 3, 2, 1, 3, 2, 0, 1, 2, 3, 1, 2, 3, 1];
  for (let s = 0; s < 16; s++) {
    const tt = t + s * (BEAT / 2);
    if (tt >= driveEnd) break;
    const lvl = tt < 75 ? 0.1 + ((tt - 64) / 11) * 0.08 : 0.19;
    pluck(tt, tones[pattern[s] % tones.length], lvl, { decay: 0.994, len: 0.8, pan: s % 2 ? 0.45 : -0.45, bright: 0.65 });
  }
  // bass pulse from 75s
  for (let b = 0; b < 8; b++) {
    const tt = t + b * BEAT;
    if (tt < 75 || tt >= driveEnd) continue;
    pluck(tt, CH[name][0] - 12, 0.32, { decay: 0.99, len: 0.5, send: 0.05, bright: 0.25 });
  }
}
for (let t = 75; t < driveEnd - 0.05; t += BEAT) {
  const beatIdx = Math.round((t - 75) / BEAT);
  if (t < 104 ? beatIdx % 2 === 0 : true) kick(t, 0.5);
  if (t >= 92) noiseBurst(t + BEAT / 2, 0.07, 0.06, { hp: 0.95, pan: 0.3, decay: 60 });
  if (t >= 121 && beatIdx % 2 === 1) noiseBurst(t, 0.2, 0.25, { hp: 0.6, send: 0.35, decay: 16 });
}
for (const t of [64, 75, 92, 104, 121, 136]) whoosh(t, 0.22);

// Breakdown — principle
pad(147.8, 156, CH.Bbmaj7, 0.3, { atk: 1.2 });
[[148.6, A4], [150.4, F4], [152.2, D4 + 12], [154.0, C4 + 12]].forEach(([t, m]) => pluck(t, m, 0.26, { decay: 0.9993, len: 4, send: 0.8, bright: 0.35 }));

// Build — scale
pad(156, 160.5, CH.F, 0.3, { atk: 0.6 });
pad(160.5, 164.9, CH.C, 0.32, { atk: 0.6, rel: 0.1 });
for (let t = 156; t < 164.8; t += BEAT) kick(t, 0.55);
for (let t = 156; t < 164.8; t += BEAT / 4) noiseBurst(t, 0.03 + ((t - 156) / 9) * 0.07, 0.04, { hp: 0.95, pan: Math.sin(t * 9) * 0.4, decay: 70 });
for (let t = 156, k = 0; t < 164.8; t += BEAT / 2, k++) pluck(t, [A4, C4 + 12, F4 + 12, C4 + 12][k % 4], 0.16, { decay: 0.994, len: 0.7, pan: k % 2 ? 0.4 : -0.4 });
riser(161.5, 164.97, 0.6);

// FINAL HIT + tail
impact(165, 1);
pad(165, 171, [29, 41, 48, 57, 60, 67, 72], 0.42, { atk: 0.05, rel: 3.5, bright: 1.3 });
pluck(165.02, F4 + 12, 0.3, { decay: 0.9994, len: 7, send: 0.9 });
pluck(166.2, C4 + 24, 0.18, { decay: 0.9994, len: 6, send: 0.9 });

/* ---------------- reverb send ---------------- */
function reverb(inp, offset) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.12;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x + c.lp * 0.86;
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
const rvL = reverb(sendL, 0);
const rvR = reverb(sendR, 23);

/* ---------------- master ---------------- */
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] += rvL[i] * 0.9;
  R[i] += rvR[i] * 0.9;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 1.6 / peak;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const fade = i > N - SR * 2 ? (N - i) / (SR * 2) : 1;
  const l = Math.tanh(L[i] * gain) * 0.89 * fade;
  const r = Math.tanh(R[i] * gain) * 0.89 * fade;
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
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
// Broadcast-style loudness: -16 LUFS integrated, -1.5 dBTP ceiling.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', String(SR), dest]);
rmSync(raw);
console.log('wrote', dest, `(${LEN}s, peak-normalized from ${peak.toFixed(2)})`);
