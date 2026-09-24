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

/** Bowed string voice: soft attack, vibrato, gentle harmonic rolloff. */
function bowed(t, dur, m, amp, { atk = 0.06, rel = 0.35, pan = 0, send = 0.55, harmonics = 7, bright = 1.25, vib = 0.12 } = {}) {
  const s0 = Math.floor(t * SR);
  const n = Math.floor((dur + rel) * SR);
  for (const det of [-0.05, 0.05]) {
    const f = mtof(m + det);
    const harm = Array.from({ length: harmonics }, (_, i) => i + 1).filter((h) => f * h < 7000);
    const ph = harm.map(() => rnd() * TAU);
    const g = harm.map((h) => 1 / h ** bright);
    const vr = 4.8 + rnd() * 0.8;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      let env = Math.min(1, tt / atk);
      if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / rel);
      env = env * env * (3 - 2 * env);
      const vibAmt = vib * Math.min(1, tt / 0.4);
      phase += (TAU * f * (1 + (vibAmt / 100) * Math.sin(TAU * vr * tt))) / SR;
      let v = 0;
      for (let k = 0; k < harm.length; k++) v += Math.sin(ph[k] + phase * harm[k]) * g[k];
      v *= amp * env * 0.5;
      put(s0 + i, v * (0.5 - pan / 2), v * (0.5 + pan / 2), send);
    }
  }
}

/** Taiko / low tom: pitched body + felt-like noise thump, big room. */
function taiko(t, amp = 0.6, { f0 = 95, f1 = 48, len = 1.4, send = 0.45 } = {}) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < len * SR; i++) {
    const tt = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt * 18);
    ph += (TAU * f) / SR;
    lp += (rnd() * 2 - 1 - lp) * 0.05;
    const v = (Math.sin(ph) * Math.exp(-tt * 3.2) + lp * 2.2 * Math.exp(-tt * 22)) * amp;
    put(s0 + i, v, v, send);
  }
}

/** Low brass "braam": bright, slow-swelling, detuned stack. */
function braam(t, notes, amp, dur = 3.5) {
  for (const m of notes) bowed(t, dur, m, amp / notes.length, { atk: 0.12, rel: 2.5, harmonics: 16, bright: 0.85, vib: 0.02, send: 0.6 });
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
// deep taiko on the story cuts
for (const t of [10, 24]) taiko(t, 0.5, { f0: 70, f1: 38, len: 2.2 });
// slow heartbeat under the market-pressure stats (felt more than heard)
for (let t = 34.2; t < 45.5; t += 1.2) {
  taiko(t, 0.26, { f0: 70, f1: 40, len: 0.8, send: 0.25 });
  taiko(t + 0.26, 0.17, { f0: 64, f1: 38, len: 0.7, send: 0.25 });
}
// cello line under the stats
bowed(34.5, 5.6, D3 - 12, 0.22, { atk: 1.5, rel: 1.5 });
bowed(40.5, 5.4, 46 - 12, 0.22, { atk: 1.5, rel: 1.5 });
// the gap: high violin tremolo swelling into the riser
for (let t = 46, k = 0; t < 56.7; t += 0.125, k++) {
  const p = (t - 46) / 10.7;
  bowed(t, 0.1, t < 51 ? A4 + 12 : C4 + 24, 0.02 + 0.06 * p * p, { atk: 0.02, rel: 0.06, pan: k % 2 ? 0.3 : -0.3, vib: 0, send: 0.7 });
}
riser(51, 56.95, 0.55);

// TITLE HIT — braam + impact + bloom
impact(57, 0.9);
braam(57, [29, 41, 48], 0.9, 3.2);
pad(57, 63.5, CH.Fadd9, 0.4, { atk: 0.3, rel: 3, bright: 1.4 });
pluck(57.4, F4 + 12, 0.14, { decay: 0.9994, len: 5, send: 0.9, bright: 0.3 });

// Walkthrough: string ostinato over i–VI–III–VII, taiko only on phrase turns
const BEAT = 0.6;
const PROG = ['Dm', 'Bb', 'F', 'C'];
const MELODY = { Dm: [A4, F4], Bb: [F4, D4], F: [C4 + 12, A4], C: [G4, E4] };
const driveStart = 64;
const driveEnd = 148;
const intensity = (t) => (t < 75 ? 0.45 : t < 104 ? 0.7 : t < 121 ? 0.85 : 1);
for (let t = driveStart, k = 0; t < driveEnd - 0.1; t += 8 * BEAT, k++) {
  const name = PROG[k % 4];
  const root = CH[name][0];
  const end = Math.min(driveEnd, t + 8 * BEAT);
  // sustained string section
  pad(t, end, CH[name], 0.3, { atk: 1.2, rel: 1.6, bright: 1.8 });
  // low strings: long bowed root, swelling
  bowed(t, end - t - 0.1, root - 12, 0.2 * intensity(t), { atk: 1.2, rel: 1.2 });
  // legato spiccato ostinato in the cello/viola register (no percussive attack)
  const ost = [root, root + 7, root + 12, root + 7];
  for (let s = 0; s < 16; s++) {
    const tt = t + s * (BEAT / 2);
    if (tt >= driveEnd) break;
    const accent = s % 4 === 0 ? 1.25 : 1;
    bowed(tt, 0.24, ost[s % 4], 0.07 * intensity(tt) * accent, { atk: 0.035, rel: 0.18, pan: s % 2 ? 0.25 : -0.25, vib: 0, send: 0.4 });
  }
  // sparse piano motif from 92s
  if (t >= 91) MELODY[name].forEach((m, i) => pluck(t + i * 4 * BEAT, m + 12, 0.1, { decay: 0.9993, len: 3.5, send: 0.85, bright: 0.28, pan: i ? 0.2 : -0.2 }));
  // taiko on the downbeat of each phrase from 75s; a second hit mid-phrase from 121s
  if (t >= 75) taiko(t, 0.42 * intensity(t));
  if (t >= 121) taiko(t + 4 * BEAT, 0.28);
}
for (const t of [64, 75, 92, 104, 121, 136]) whoosh(t, 0.16);

// Breakdown — principle: strings drop to a hush, lone piano
pad(147.8, 156, CH.Bbmaj7, 0.17, { atk: 2, bright: 2.2 });
bowed(148, 7.5, 46 - 12, 0.07, { atk: 2.5, rel: 2 });
[[148.8, A4], [150.6, F4], [152.4, D4 + 12], [154.2, C4 + 12]].forEach(([t, m]) => pluck(t, m + 12, 0.07, { decay: 0.999, len: 3.5, send: 0.8, bright: 0.28 }));

// Build — scale: ostinato quickens, taiko roll crescendo into the final hit
pad(156, 160.5, CH.F, 0.32, { atk: 1 });
pad(160.5, 164.9, CH.C, 0.36, { atk: 0.8, rel: 0.1 });
bowed(156, 4.4, 41 - 12, 0.2, { atk: 1, rel: 0.4 });
bowed(160.5, 4.3, 48 - 12, 0.24, { atk: 0.8, rel: 0.1 });
for (let t = 156, k = 0; t < 164.8; t += BEAT / 4, k++) {
  const p = (t - 156) / 8.8;
  const r = t < 160.5 ? 41 : 48;
  bowed(t, 0.12, [r, r + 7, r + 12, r + 7][k % 4], 0.05 + 0.07 * p, { atk: 0.02, rel: 0.1, pan: k % 2 ? 0.3 : -0.3, vib: 0, send: 0.35 });
}
{
  let t = 156;
  let gap = 1.2;
  while (t < 164.85) {
    const p = (t - 156) / 8.8;
    taiko(t, 0.2 + 0.4 * p * p, { f0: 110, f1: 55, len: 0.9 });
    t += gap;
    gap = Math.max(0.15, gap * 0.86);
  }
}
riser(161.5, 164.97, 0.5);

// FINAL HIT — braam, impact, resolve on F with a long tail
impact(165, 0.95);
braam(165, [29, 41, 48], 1, 4);
pad(165, 171, [29, 41, 48, 57, 60, 67, 72], 0.4, { atk: 0.3, rel: 3.5, bright: 1.4 });
pluck(165.4, F4 + 12, 0.14, { decay: 0.9995, len: 7, send: 0.95, bright: 0.28 });
pluck(166.6, C4 + 24, 0.09, { decay: 0.9995, len: 6, send: 0.95, bright: 0.28 });

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
      c.buf[c.i] = x + c.lp * 0.89;
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
