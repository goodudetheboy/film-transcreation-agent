import { Easing, interpolate } from 'remotion';
import { FPS } from './theme';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const sec = (s: number) => Math.round(s * FPS);

/** 0→1 over [start, start+dur], eased and clamped. */
export const prog = (f: number, start: number, dur: number, easing = easeOut) =>
  interpolate(f, [start, start + dur], [0, 1], { ...CLAMP, easing });

/** 1 until `end - dur`, then eases to 0 at `end`. */
export const outro = (f: number, end: number, dur = 15) => 1 - prog(f, end - dur, dur, easeInOut);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Typewriter: how many chars of `text` are visible. */
export const typed = (text: string, f: number, start: number, cps = 40) =>
  text.slice(0, Math.max(0, Math.floor(((f - start) / FPS) * cps)));

export const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
