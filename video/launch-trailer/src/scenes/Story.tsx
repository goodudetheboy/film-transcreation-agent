import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CLAMP, easeInOut, outro, prog } from '../anim';
import { Flag } from '../components/Flags';
import { LogoMark, Wordmark } from '../components/Logo';
import { Backdrop, Check, Footnote, Grain, Reveal, Vignette } from '../components/ui';
import { C, FONT } from '../theme';

const Letterbox: React.FC = () => (
  <>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 138, background: '#000' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 138, background: '#000' }} />
  </>
);

/* 1 — Cold open: two subtitle lines over black. */
export const ColdOpen: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = prog(f, 18, 30) * (1 - prog(f, 128, 22, easeInOut));
  const b = prog(f, 162, 26) * outro(f, dur, 26);
  const dying = interpolate(f, [220, 285], [1, 0.18], CLAMP);
  const sub: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 640,
    textAlign: 'center',
    fontFamily: FONT,
    fontWeight: 500,
    fontSize: 52,
    color: '#f4f4f0',
    textShadow: '0 2px 10px rgba(0,0,0,0.9)',
    letterSpacing: '0.005em',
  };
  const ember = prog(f, 0, 90);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 420px at 50% 62%, rgba(59,130,246,${0.07 * ember}), transparent 70%)` }} />
      <div style={{ ...sub, opacity: a }}>A script can be translated perfectly.</div>
      <div style={{ ...sub, opacity: b }}>
        And a scene can still <span style={{ opacity: dying, filter: `blur(${(1 - dying) * 3}px)` }}>die.</span>
      </div>
      <Letterbox />
      <Grain opacity={0.08} />
    </AbsoluteFill>
  );
};

/* ---------- line-art props ---------- */
const draw = (p: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p });

const Broccoli: React.FC<{ p: number; fill: number }> = ({ p, fill }) => {
  const florets: [number, number, number][] = [
    [70, 82, 26], [100, 64, 30], [132, 84, 26], [84, 106, 22], [118, 108, 22], [100, 92, 20],
  ];
  return (
    <svg width={360} height={360} viewBox="0 0 200 200">
      <path d="M86 196 C88 170 90 150 82 124 M114 196 C112 170 110 150 118 124 M86 196 H114 M100 176 C100 150 100 130 100 110 M92 150 C84 140 76 132 70 120 M108 150 C116 140 124 132 130 122"
        fill="none" stroke="#8fd19e" strokeWidth={3} strokeLinecap="round" {...draw(p)} />
      {florets.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={`rgba(76,175,80,${0.16 * fill})`} stroke="#8fd19e" strokeWidth={3} {...draw(Math.min(1, p * 1.2 - i * 0.04))} />
      ))}
      {florets.map(([cx, cy, r], i) => (
        <circle key={`d${i}`} cx={cx - r / 3} cy={cy - r / 4} r={r / 5} fill="none" stroke="#8fd19e" strokeWidth={2} opacity={fill * 0.7} />
      ))}
    </svg>
  );
};

const Pepper: React.FC<{ p: number; fill: number }> = ({ p, fill }) => (
  <svg width={360} height={360} viewBox="0 0 200 200">
    <path d="M100 60 C70 55 45 70 45 105 C45 145 62 182 82 184 C92 185 96 176 100 176 C104 176 108 185 118 184 C138 182 155 145 155 105 C155 70 130 55 100 60 Z"
      fill={`rgba(52,168,83,${0.18 * fill})`} stroke="#6fdc8c" strokeWidth={3} strokeLinejoin="round" {...draw(p)} />
    <path d="M100 64 C92 100 94 150 100 174 M70 70 C60 100 62 140 76 176 M130 70 C140 100 138 140 124 176" fill="none" stroke="#6fdc8c" strokeWidth={2} opacity={0.55} {...draw(p)} />
    <path d="M82 62 C88 50 112 50 118 62" fill="none" stroke="#6fdc8c" strokeWidth={3} strokeLinecap="round" {...draw(p)} />
    <path d="M100 56 C100 42 106 32 120 28" fill="none" stroke="#6fdc8c" strokeWidth={4} strokeLinecap="round" {...draw(p)} />
    <path d="M62 96 C60 110 62 124 66 132" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.35 * fill} />
  </svg>
);

/* 2 — The Inside Out broccoli story. */
export const BroccoliStory: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = outro(f, dur, 20);
  const bro = prog(f, 20, 60, easeInOut);
  const arrow = prog(f, 140, 26);
  const pep = prog(f, 150, 60, easeInOut);
  const chip = (at: number) => ({ opacity: prog(f, at, 18), transform: `translateY(${(1 - prog(f, at, 18)) * 12}px)` });
  const broDim = interpolate(f, [150, 200], [1, 0.45], CLAMP);
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT }}>
      <Backdrop tint="rgba(76,175,80,0.09)" grid={false} />
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center' }}>
        <div style={{ color: C.gold, fontSize: 20, letterSpacing: '0.3em', fontWeight: 700, opacity: prog(f, 4, 20) }}>INSIDE OUT · 2015</div>
        <div style={{ marginTop: 22, fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em', color: C.text, height: 70 }}>
          <Reveal text="In Japan, broccoli isn't the villain." start={96} />
          <Reveal text=" Green peppers are." start={196} style={{ color: '#6fdc8c' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 320, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 70 }}>
        <div style={{ textAlign: 'center', opacity: broDim }}>
          <Broccoli p={bro} fill={prog(f, 70, 30)} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', color: C.dim, fontSize: 20, ...chip(60) }}>
            <Flag code="US" w={30} /> Riley's broccoli
          </div>
        </div>
        <svg width={160} height={40} viewBox="0 0 160 40">
          <path d="M4 20 H150 M136 8 L152 20 L136 32" fill="none" stroke={C.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...draw(arrow)} />
        </svg>
        <div style={{ textAlign: 'center' }}>
          <Pepper p={pep} fill={prog(f, 200, 30)} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', color: C.text, fontSize: 20, ...chip(190) }}>
            <Flag code="JP" w={30} /> ピーマン · green pepper
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 820, width: '100%', textAlign: 'center' }}>
        <Reveal text="The fix wasn't a subtitle. It was a prop." start={250} style={{ fontSize: 36, fontWeight: 500, color: C.text }} />
        <div style={{ marginTop: 22, display: 'flex', gap: 18, justifyContent: 'center' }}>
          {['Re-animated across 28 graphics', '45 shots'].map((t, i) => (
            <span key={t} style={{ ...chip(300 + i * 10), fontSize: 20, fontWeight: 700, color: C.gold, border: `1px solid rgba(232,199,122,0.35)`, borderRadius: 999, padding: '8px 18px' }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <Footnote style={{ position: 'absolute', right: 60, bottom: 40, opacity: prog(f, 320, 20) }}>Source: SlashFilm</Footnote>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

/* 3 — Translation vs transcreation. */
export const TwoQuestions: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = outro(f, dur, 18);
  const focus = prog(f, 170, 30, easeInOut);
  const line = prog(f, 10, 50, easeInOut);
  const col = (left: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 390,
    width: 760,
    left: left ? 120 : 1040,
    fontFamily: FONT,
  });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Backdrop grid={false} />
      <div style={{ position: 'absolute', left: 959, top: 540 - 220 * line, height: 440 * line, width: 1, background: C.borderStrong }} />
      <div style={{ ...col(true), opacity: 1 - focus * 0.62 }}>
        <div style={{ color: C.dim, fontSize: 20, letterSpacing: '0.28em', fontWeight: 700, opacity: prog(f, 12, 20) }}>TRANSLATION ASKS</div>
        <Reveal text="Can they understand this?" start={24} style={{ display: 'block', marginTop: 24, fontSize: 64, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.1 }} />
      </div>
      <div style={col(false)}>
        <div style={{ color: C.accent, fontSize: 20, letterSpacing: '0.28em', fontWeight: 700, opacity: prog(f, 90, 20) }}>TRANSCREATION ASKS</div>
        <Reveal text="Will they connect with it?" start={102} style={{ display: 'block', marginTop: 24, fontSize: 64, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.1 }} />
        <div style={{ marginTop: 26, height: 4, width: 540 * focus, background: `linear-gradient(90deg, ${C.accent}, transparent)`, borderRadius: 2 }} />
      </div>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

/* 4 — Market pressure. */
const StatCard: React.FC<{ at: number; big: React.ReactNode; label: string; source: string; children?: React.ReactNode }> = ({ at, big, label, source, children }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, 26);
  return (
    <div
      style={{
        width: 500,
        height: 400,
        padding: 36,
        borderRadius: 20,
        background: 'linear-gradient(180deg, rgba(21,22,28,0.95), rgba(14,15,19,0.95))',
        border: `1px solid ${C.border}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px)`,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: '-0.03em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
      <div style={{ fontSize: 23, color: C.dim, lineHeight: 1.4, marginTop: 10 }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>{children}</div>
      <Footnote style={{ marginTop: 18 }}>{source}</Footnote>
    </div>
  );
};

export const Pressure: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = outro(f, dur, 18);
  const eps = Math.round(interpolate(f, [80, 130], [1, 8], CLAMP));
  const money = interpolate(f, [110, 190], [3.8, 10], { ...CLAMP, easing: easeInOut });
  const bars = [3.8, 4.4, 5.1, 5.8, 6.5, 7.3, 8.1, 8.9, 9.6, 10.3];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Backdrop tint="rgba(245,158,11,0.07)" />
      <div style={{ position: 'absolute', top: 130, width: '100%', textAlign: 'center', fontFamily: FONT }}>
        <Reveal text="The people who catch the miss" start={8} style={{ fontSize: 54, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }} />
        <br />
        <Reveal text="are the resource running out." start={26} style={{ fontSize: 54, fontWeight: 700, color: C.warning, letterSpacing: '-0.02em' }} />
      </div>
      <div style={{ position: 'absolute', top: 390, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 40 }}>
        <StatCard at={70} big={<>1 → {eps}</>} label="Episodes per release. Streaming turned one a week into a full-season drop." source="Industry release cadence">
          <div style={{ display: 'flex', gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ width: 40, height: 56, borderRadius: 6, border: `1.5px solid ${i < eps ? C.warning : C.border}`, background: i < eps ? C.warningDim : 'transparent' }} />
            ))}
          </div>
        </StatCard>
        <StatCard at={100} big={<>${money.toFixed(1)}B{money > 9.95 ? '+' : ''}</>} label="Video subtitle translation market, 2026 → 2035." source="MarkWide Research">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
            {bars.map((b, i) => (
              <div key={i} style={{ width: 34, height: 76 * (b / 10.3) * prog(f, 110 + i * 7, 20), background: i === bars.length - 1 ? C.warning : '#3a3e4c', borderRadius: 4 }} />
            ))}
          </div>
        </StatCard>
        <StatCard at={130} big="2–3 yrs" label="Projected translator shortage, per the CEO of a vendor localizing 600,000+ episodes a year." source="Iyuno-SDI CEO, via Rest of World">
          <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#23252e', overflow: 'hidden' }}>
            <div style={{ width: `${100 - 70 * prog(f, 150, 80, easeInOut)}%`, height: '100%', background: C.danger }} />
          </div>
        </StatCard>
      </div>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

/* 5 — Every stage has a tool, except the one that matters. */
export const Gap: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = 1 - prog(f, dur - 26, 20, easeInOut);
  const stages = [
    ['TRANSLATION', 'Can they read it?'],
    ['DUBBING', 'Can they hear it?'],
    ['SUBTITLE QC', 'Is it timed right?'],
    ['COMPLIANCE', 'Will it pass review?'],
  ];
  const swap = prog(f, 190, 20, easeInOut);
  const gapIn = prog(f, 130, 30);
  const pulse = 0.5 + 0.5 * Math.sin(f / 7);
  const cardW = 290;
  const gap = 36;
  const left = (1920 - (cardW * 5 + gap * 4)) / 2;
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT }}>
      <Backdrop />
      <div style={{ position: 'absolute', top: 200, width: '100%', textAlign: 'center', height: 140 }}>
        <div style={{ position: 'absolute', width: '100%', opacity: 1 - swap }}>
          <Reveal text="Every stage of localization has a tool." start={6} style={{ fontSize: 56, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }} />
        </div>
        <div style={{ position: 'absolute', width: '100%', opacity: swap }}>
          <Reveal text="None of them ask if the line will still land." start={196} style={{ fontSize: 56, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }} />
        </div>
      </div>
      <svg style={{ position: 'absolute', left: 0, top: 0 }} width={1920} height={1080}>
        <line x1={left + cardW / 2} y1={560} x2={left + 4 * (cardW + gap) + cardW / 2} y2={560} stroke={C.border} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(f, 20, 110, easeInOut)} />
      </svg>
      {stages.map(([t, q], i) => {
        const p = prog(f, 30 + i * 22, 24);
        return (
          <div
            key={t}
            style={{
              position: 'absolute',
              left: left + i * (cardW + gap),
              top: 460,
              width: cardW,
              height: 200,
              borderRadius: 16,
              background: C.panel,
              border: `1px solid ${C.border}`,
              padding: 26,
              boxSizing: 'border-box',
              opacity: p * (1 - swap * 0.45),
              transform: `translateY(${(1 - p) * 30}px)`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.16em', color: C.dim }}>{t}</span>
              <Check size={24} p={prog(f, 44 + i * 22, 16)} />
            </div>
            <div style={{ marginTop: 44, fontSize: 28, fontWeight: 500, color: C.text }}>{q}</div>
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: left + 4 * (cardW + gap),
          top: 460,
          width: cardW,
          height: 200,
          borderRadius: 16,
          border: `2px dashed rgba(245,158,11,${0.4 + 0.5 * pulse * gapIn})`,
          background: `rgba(245,158,11,${0.05 + 0.05 * pulse})`,
          boxShadow: `0 0 ${60 * pulse * gapIn}px rgba(245,158,11,0.25)`,
          padding: 26,
          boxSizing: 'border-box',
          opacity: gapIn,
          transform: `scale(${0.94 + 0.06 * gapIn + swap * 0.06})`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.16em', color: C.warning }}>? — NOTHING</div>
        <div style={{ marginTop: 44, fontSize: 28, fontWeight: 700, color: C.text }}>Will it still land?</div>
      </div>
      <div style={{ position: 'absolute', top: 760, width: '100%', textAlign: 'center', fontSize: 26, color: C.dim, opacity: prog(f, 230, 24) }}>
        No regulator fails it. No format check trips. The scene just quietly underperforms.
      </div>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

/* 6 — Brand reveal (lands on the music's impact at frame 0). */
export const TitleReveal: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const conv = spring({ frame: f, fps, config: { damping: 14, stiffness: 120, mass: 0.7 } });
  const flash = Math.max(0, 1 - f / 14);
  const o = outro(f, dur, 22);
  const track = interpolate(f, [10, 70], [0.4, -0.02], { ...CLAMP, easing: easeInOut });
  return (
    <AbsoluteFill style={{ background: C.black, opacity: o }}>
      <AbsoluteFill style={{ background: `radial-gradient(800px 500px at 50% 45%, rgba(59,130,246,${0.22 * (0.4 + flash)}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: '#cfe0ff', opacity: flash * 0.35 }} />
      <div style={{ position: 'absolute', top: 290, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <LogoMark size={180} converge={conv} lens={prog(f, 4, 16)} glow={0.9 + flash} />
      </div>
      <div style={{ position: 'absolute', top: 530, width: '100%', textAlign: 'center', opacity: prog(f, 12, 30) }}>
        <Wordmark size={118} spacing={track} />
      </div>
      <div style={{ position: 'absolute', top: 700, width: '100%', textAlign: 'center', fontFamily: FONT }}>
        <Reveal text="Cultural-risk triage for film & series localization." start={60} style={{ fontSize: 34, color: C.dim, fontWeight: 500 }} />
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
