import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { CLAMP, easeInOut, easeOut, mmss, prog } from '../anim';
import { SUBTITLES } from '../data/subtitles';
import { C, FONT } from '../theme';
import { LogoMark, Wordmark } from './Logo';

/* ------------------------------------------------------------------ */
/* Atmosphere                                                          */
/* ------------------------------------------------------------------ */

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${f % 6}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 6} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${f % 6})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.7 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Studio backdrop for product scenes: deep navy-black, soft key light, faint grid. */
export const Backdrop: React.FC<{ tint?: string; grid?: boolean }> = ({ tint = 'rgba(59,130,246,0.13)', grid = true }) => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 90) * 40;
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 650px at ${68 + drift / 20}% 8%, ${tint}, transparent 65%),
                       radial-gradient(900px 600px at 8% 105%, rgba(232,199,122,0.06), transparent 60%)`,
        }}
      />
      {grid && (
        <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.35 }}>
          <defs>
            <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse" x={0} y={f * 0.15}>
              <path d="M64 0 H0 V64" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={1} />
            </pattern>
            <radialGradient id="gridFade" cx="50%" cy="40%" r="70%">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="gridMask">
              <rect width="100%" height="100%" fill="url(#gridFade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" mask="url(#gridMask)" />
        </svg>
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

/** Word-by-word rise + unblur. */
export const Reveal: React.FC<{
  text: string;
  start: number;
  stagger?: number;
  dur?: number;
  style?: React.CSSProperties;
  wordStyle?: (i: number, word: string) => React.CSSProperties | undefined;
}> = ({ text, start, stagger = 3, dur = 22, style, wordStyle }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((w, i) => {
        const p = prog(f, start + i * stagger, dur);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * 18}px)`,
              filter: `blur(${(1 - p) * 8}px)`,
              whiteSpace: 'pre',
              ...wordStyle?.(i, w),
            }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
};

/** Section header shown above the product window in walkthrough scenes. */
export const StepHeader: React.FC<{ num: string; label: string; title: string; sub: string; end: number }> = ({
  num,
  label,
  title,
  sub,
  end,
}) => {
  const f = useCurrentFrame();
  const out = 1 - prog(f, end - 14, 14, easeInOut);
  const line = prog(f, 2, 26);
  return (
    <div style={{ position: 'absolute', left: 120, top: 52, right: 120, fontFamily: FONT, opacity: out }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 18, letterSpacing: '0.24em', opacity: line }}>{num}</span>
        <span style={{ height: 1, width: 56 * line, background: C.accent }} />
        <span style={{ color: C.dim, fontWeight: 700, fontSize: 18, letterSpacing: '0.24em', opacity: line }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 60 }}>
        <Reveal text={title} start={6} style={{ color: C.text, fontSize: 50, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', flexShrink: 0 }} />
        <div style={{ maxWidth: 620, color: C.dim, fontSize: 21, lineHeight: 1.45, opacity: prog(f, 22, 24), textAlign: 'right' }}>
          {sub}
        </div>
      </div>
    </div>
  );
};

export const Footnote: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: FONT, fontSize: 16, color: C.faint, letterSpacing: '0.04em', ...style }}>{children}</div>
);

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                      */
/* ------------------------------------------------------------------ */

export const Badge: React.FC<{ tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'; children: React.ReactNode; style?: React.CSSProperties }> = ({
  tone = 'neutral',
  children,
  style,
}) => {
  const map = {
    accent: [C.accentSoft, '#8ab4ff'],
    success: [C.successDim, C.success],
    warning: [C.warningDim, C.warning],
    danger: [C.dangerDim, C.danger],
    neutral: ['#1b1d24', C.dim],
  }[tone];
  return (
    <span
      style={{
        background: map[0],
        color: map[1],
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 14,
        padding: '4px 10px',
        borderRadius: 999,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export const Button: React.FC<{ primary?: boolean; children: React.ReactNode; style?: React.CSSProperties; pressed?: number }> = ({
  primary,
  children,
  style,
  pressed = 0,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: 16,
      padding: '10px 18px',
      borderRadius: 10,
      background: primary ? C.accent : C.panel,
      color: primary ? '#fff' : C.text,
      border: `1px solid ${primary ? C.accent : C.borderStrong}`,
      boxShadow: primary ? `0 0 ${24 * (1 + pressed)}px ${C.accentGlow}` : undefined,
      transform: `scale(${1 - pressed * 0.05})`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);

export const Panel: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: C.panel2,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = C.accent }) => {
  const f = useCurrentFrame();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ transform: `rotate(${f * 12}deg)` }}>
      <circle cx={10} cy={10} r={8} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2.5} />
      <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
};

export const Check: React.FC<{ size?: number; color?: string; p?: number }> = ({ size = 16, color = C.success, p = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20">
    <path d="M4 10.5 L8.2 14.5 L16 5.5" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* App chrome                                                          */
/* ------------------------------------------------------------------ */

/** Floating app window. Content is laid out at 1:1 inside `w`×`h`. */
export const AppWindow: React.FC<{
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  nav?: 'Films' | 'Projects' | 'Workspace';
  enter?: number;
  exit?: number;
  children?: React.ReactNode;
}> = ({ w = 1680, h = 820, x = 120, y = 228, nav = 'Workspace', enter = 0, exit, children }) => {
  const f = useCurrentFrame();
  const pin = prog(f, enter, 28);
  const pout = exit === undefined ? 0 : prog(f, exit - 16, 16, easeInOut);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        background: C.bg,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02), 0 0 80px rgba(59,130,246,0.08)',
        opacity: pin * (1 - pout),
        transform: `translateY(${(1 - pin) * 50 + pout * -20}px) scale(${0.97 + pin * 0.03})`,
        fontFamily: FONT,
        color: C.text,
      }}
    >
      <div
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '0 22px',
          borderBottom: `1px solid ${C.border}`,
          background: 'linear-gradient(#121319, #0e0f13)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={26} />
          <Wordmark size={22} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 18 }}>
          {(['Films', 'Projects', 'Workspace'] as const).map((n) => (
            <span
              key={n}
              style={{
                fontSize: 15,
                fontWeight: 700,
                padding: '7px 16px',
                borderRadius: 999,
                background: nav === n ? C.accent : 'transparent',
                color: nav === n ? '#fff' : C.dim,
              }}
            >
              {n === 'Workspace' ? 'Current Workspace' : n}
            </span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: C.dim, fontSize: 15, fontWeight: 500 }}>
          <svg width={16} height={16} viewBox="0 0 20 20">
            <circle cx={10} cy={7} r={3.6} fill="none" stroke={C.dim} strokeWidth={1.6} />
            <path d="M3.5 17 C4.5 12.5 15.5 12.5 16.5 17" fill="none" stroke={C.dim} strokeWidth={1.6} />
          </svg>
          localization lead
        </div>
      </div>
      <div style={{ position: 'relative', height: h - 60 }}>{children}</div>
    </div>
  );
};

export const WorkspaceTitle: React.FC<{ tab: 'DETAILS' | 'PROJECT' | 'AGENT STATUS'; projectFlag?: string }> = ({ tab, projectFlag }) => (
  <div style={{ padding: '16px 22px 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>Sprite Fright — Blender Open Movie</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 12, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['DETAILS', 'PROJECT', 'AGENT STATUS'] as const).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '7px 14px',
              borderRadius: 7,
              color: tab === t ? '#8ab4ff' : C.dim,
              background: tab === t ? C.accentSoft : 'transparent',
            }}
          >
            {t === 'PROJECT' && projectFlag ? `PROJECT: ${projectFlag}` : t}
          </span>
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.faint }}>STATUS</span>
      <Badge tone="success">Processed</Badge>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export type ClipSpec = { src: string; from: number; dur: number };

export const Player: React.FC<{
  w: number;
  h: number;
  clips: ClipSpec[];
  subtitle?: React.ReactNode;
  time: number;
  style?: React.CSSProperties;
}> = ({ w, h, clips, subtitle, time, style }) => {
  const videoH = h - 58;
  return (
    <Panel style={{ width: w, height: h, background: '#000', ...style }}>
      <div style={{ position: 'relative', width: w, height: videoH, background: '#000' }}>
        {clips.map((c, i) => (
          <Sequence key={i} from={c.from} durationInFrames={c.dur} layout="none">
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
              <OffthreadVideo src={staticFile(`clips/${c.src}.mp4`)} muted style={{ width: '100%' }} />
            </div>
          </Sequence>
        ))}
        {subtitle && (
          <div
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              bottom: 22,
              textAlign: 'center',
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: Math.round(w / 30),
              lineHeight: 1.3,
              color: '#fff',
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ height: 58, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: C.panel2, borderTop: `1px solid ${C.border}` }}>
        {['M13 5 L6 10 L13 15 Z M5 5 V15', 'M6 4 L16 10 L6 16 Z', 'M7 5 L14 10 L7 15 Z M15 5 V15'].map((d, i) => (
          <span
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: i === 1 ? C.accent : C.panel,
              border: `1px solid ${i === 1 ? C.accent : C.border}`,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 20 20">
              <path d={d} fill="#fff" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
          </span>
        ))}
        <div style={{ width: 90, height: 4, borderRadius: 2, background: C.accent, marginLeft: 12 }} />
        <span style={{ fontFamily: FONT, fontSize: 15, color: C.dim, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>
          {mmss(time)} / 10:29
        </span>
      </div>
    </Panel>
  );
};

/* ------------------------------------------------------------------ */
/* NLE timeline                                                        */
/* ------------------------------------------------------------------ */

export type DetailBlock = { s: number; e: number; color: string; at: number };
const FILM_LEN = 630;

export const TimelineTracks: React.FC<{
  w: number;
  playhead: number;
  details: DetailBlock[];
  subtitlesAt?: number;
  flag?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ w, playhead, details, subtitlesAt = -999, flag, style }) => {
  const f = useCurrentFrame();
  const labelW = 110;
  const tw = w - labelW - 16;
  const x = (s: number) => labelW + (s / FILM_LEN) * tw;
  return (
    <div style={{ position: 'relative', width: w, height: 112, background: C.panel2, borderTop: `1px solid ${C.border}`, fontFamily: FONT, ...style }}>
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', left: x(i * 60), top: 6, fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ width: 1, height: 6, background: C.borderStrong, marginBottom: 2 }} />
          {mmss(i * 60)}
        </div>
      ))}
      {['SUBTITLES', 'DETAILS'].map((l, i) => (
        <div key={l} style={{ position: 'absolute', left: 14, top: 44 + i * 32, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.faint, display: 'flex', gap: 6, alignItems: 'center' }}>
          {i === 1 && flag}
          {l}
        </div>
      ))}
      {SUBTITLES.map(([s, e], i) => {
        const o = prog(f, subtitlesAt + i * 0.4, 8);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x(s),
              top: 40,
              width: Math.max(3, x(e) - x(s) - 1),
              height: 22,
              borderRadius: 3,
              background: '#2a2d38',
              border: '1px solid #3a3e4c',
              opacity: o,
            }}
          />
        );
      })}
      {details.map((d, i) => {
        const o = prog(f, d.at, 10);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x(d.s),
              top: 74,
              width: Math.max(5, x(d.e) - x(d.s)),
              height: 24,
              borderRadius: 3,
              background: d.color,
              opacity: 0.85 * o,
              transform: `scaleY(${0.3 + 0.7 * o})`,
              boxShadow: o < 1 && o > 0 ? `0 0 12px ${d.color}` : undefined,
            }}
          />
        );
      })}
      <div style={{ position: 'absolute', left: x(playhead), top: 0, bottom: 0, width: 2, background: C.accent, boxShadow: `0 0 10px ${C.accent}` }} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pointer                                                             */
/* ------------------------------------------------------------------ */

export type CursorKey = { f: number; x: number; y: number };

export const Cursor: React.FC<{ keys: CursorKey[]; clicks?: number[]; show?: [number, number] }> = ({ keys, clicks = [], show }) => {
  const f = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const x = interpolate(f, fs, keys.map((k) => k.x), { ...CLAMP, easing: easeInOut });
  const y = interpolate(f, fs, keys.map((k) => k.y), { ...CLAMP, easing: easeInOut });
  const vis = show ? prog(f, show[0], 8) * (1 - prog(f, show[1] - 8, 8)) : 1;
  const click = clicks.find((c) => f >= c && f < c + 18);
  const cp = click === undefined ? 0 : (f - click) / 18;
  const press = click === undefined ? 0 : Math.max(0, 1 - Math.abs(f - click - 3) / 4);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: vis, zIndex: 50, pointerEvents: 'none' }}>
      {click !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: -30 * (0.3 + cp),
            top: -30 * (0.3 + cp),
            width: 60 * (0.3 + cp),
            height: 60 * (0.3 + cp),
            borderRadius: '50%',
            border: `2px solid ${C.accent}`,
            opacity: 1 - cp,
          }}
        />
      )}
      <svg width={30} height={30} viewBox="0 0 24 24" style={{ transform: `scale(${1 - press * 0.15})`, transformOrigin: '0 0', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6))' }}>
        <path d="M3 2 L3 19 L7.6 14.8 L10.6 21.4 L13.4 20.2 L10.5 13.8 L16.8 13.6 Z" fill="#fff" stroke="#111" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Callout card that floats above the window to spotlight something. */
export const Callout: React.FC<{ x: number; y: number; at: number; until?: number; w?: number; children: React.ReactNode }> = ({ x, y, at, until, w = 420, children }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, 20);
  const o = until === undefined ? 1 : 1 - prog(f, until - 12, 12);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        zIndex: 40,
        padding: '18px 20px',
        borderRadius: 14,
        background: 'rgba(21,22,28,0.94)',
        border: `1px solid ${C.accentDim}`,
        boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(59,130,246,0.18)`,
        fontFamily: FONT,
        color: C.text,
        opacity: p * o,
        transform: `translateY(${(1 - p) * 24}px) scale(${0.96 + 0.04 * p})`,
      }}
    >
      {children}
    </div>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.faint, style }) => (
  <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color, textTransform: 'uppercase', ...style }}>{children}</div>
);

export const ProgressBar: React.FC<{ p: number; w: number | string; color?: string; h?: number }> = ({ p, w, color = C.accent, h = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: h, background: '#23252e', overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(1, Math.max(0, p)) * 100}%`, height: '100%', background: color, borderRadius: h, boxShadow: `0 0 12px ${color}` }} />
  </div>
);

export { easeOut };
