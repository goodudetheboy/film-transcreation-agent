import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CLAMP, easeInOut, outro, prog } from '../anim';
import { Flag, FLAGS } from '../components/Flags';
import { LogoMark, Wordmark } from '../components/Logo';
import { Backdrop, Footnote, Grain, Reveal, Vignette } from '../components/ui';
import { C, FONT } from '../theme';

/* 7 — The human-in-the-loop principle. */
export const Principle: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = outro(f, dur, 20);
  return (
    <AbsoluteFill style={{ background: C.black, opacity: o, fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(900px 500px at 50% 50%, rgba(59,130,246,0.08), transparent 70%)' }} />
      <div style={{ position: 'absolute', top: 380, width: '100%', textAlign: 'center' }}>
        <Reveal
          text="TranscreAI never silently changes anything."
          start={10}
          style={{ fontSize: 62, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}
          wordStyle={(_, w) => (w === 'never' ? { color: C.accent } : undefined)}
        />
        <div style={{ marginTop: 40 }}>
          <Reveal text="It decides where a specialist looks first, and shows why." start={96} style={{ fontSize: 36, color: C.dim, fontWeight: 500 }} />
        </div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

/* 8 — Scale: many markets without one consultant per market. */
const MARKETS = Object.keys(FLAGS).filter((c) => c !== 'US');
const SEED = ['JP', 'DE', 'IN', 'GB', 'VN'];

export const Scale: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = outro(f, dur, 18);
  const order = [...SEED, ...MARKETS.filter((c) => !SEED.includes(c))];
  const cols = 8;
  const cellW = 150;
  const cellH = 112;
  const gridW = cols * cellW;
  const count = Math.round(interpolate(f, [50, 170], [5, order.length], { ...CLAMP, easing: easeInOut }));
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT }}>
      <Backdrop />
      <div style={{ position: 'absolute', top: 96, width: '100%', textAlign: 'center' }}>
        <Reveal text="Fifty markets shouldn't mean fifty consultants." start={6} style={{ fontSize: 56, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }} />
        <div style={{ marginTop: 18, fontSize: 24, color: C.dim, opacity: prog(f, 40, 20) }}>
          Live research stands in for in-market lookup, so reviewers spend their hours on the lines that matter.
        </div>
      </div>
      <div style={{ position: 'absolute', top: 370, left: (1920 - gridW) / 2, width: gridW, display: 'flex', flexWrap: 'wrap' }}>
        {order.map((c, i) => {
          const a = i < 5 ? 20 + i * 5 : 50 + (i - 5) * 4;
          const p = prog(f, a, 16);
          const done = prog(f, a + 30, 40, easeInOut);
          return (
            <div key={c} style={{ width: cellW, height: cellH, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: p, transform: `scale(${0.7 + 0.3 * p})` }}>
              <div style={{ position: 'relative' }}>
                <Flag code={c} w={66} radius={6} />
                <svg width={24} height={24} viewBox="0 0 24 24" style={{ position: 'absolute', right: -12, bottom: -10 }}>
                  <circle cx={12} cy={12} r={10} fill={C.bg} stroke={C.border} strokeWidth={2} />
                  <circle cx={12} cy={12} r={10} fill="none" stroke={done >= 1 ? C.success : C.accent} strokeWidth={2.4} strokeDasharray={62.8} strokeDashoffset={62.8 * (1 - done)} transform="rotate(-90 12 12)" />
                </svg>
              </div>
              <div style={{ fontSize: 14, color: C.dim, fontWeight: 500 }}>{FLAGS[c].name}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', bottom: 70, width: '100%', textAlign: 'center', fontSize: 22, color: C.faint, fontVariantNumeric: 'tabular-nums', opacity: prog(f, 40, 20) }}>
        <span style={{ color: C.text, fontWeight: 900, fontSize: 30 }}>{count}</span> target markets · one reviewer’s shortlist each
      </div>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

/* 9 — End card. */
export const EndCard: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const o = 1 - prog(f, dur - 40, 36, easeInOut);
  return (
    <AbsoluteFill style={{ background: C.black, fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: o }}>
        <AbsoluteFill style={{ background: `radial-gradient(900px 520px at 50% 40%, rgba(59,130,246,${0.16 * prog(f, 0, 40)}), transparent 70%)` }} />
        <div style={{ position: 'absolute', top: 210, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <LogoMark size={120} converge={prog(f, 0, 30, easeInOut)} lens={prog(f, 16, 20)} glow={0.6} />
        </div>
        <div style={{ position: 'absolute', top: 380, width: '100%', textAlign: 'center', opacity: prog(f, 10, 24) }}>
          <Wordmark size={96} />
        </div>
        <div style={{ position: 'absolute', top: 520, width: '100%', textAlign: 'center' }}>
          <Reveal text="Will this line still land?" start={30} style={{ fontSize: 40, color: C.text, fontWeight: 500 }} />
        </div>
        <div style={{ position: 'absolute', top: 620, width: '100%', display: 'flex', justifyContent: 'center', opacity: prog(f, 56, 20) }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#cfe0ff', padding: '14px 30px', borderRadius: 999, border: `1px solid ${C.accent}`, background: C.accentSoft, boxShadow: `0 0 40px ${C.accentGlow}` }}>
            cinema.vietrochack.com
          </span>
        </div>
        <div style={{ position: 'absolute', top: 760, width: '100%', textAlign: 'center', fontSize: 20, color: C.dim, opacity: prog(f, 80, 20), letterSpacing: '0.04em' }}>
          Built with Gemini on Vertex AI · Parallel Search · Cloud Run · Firestore
        </div>
        <Footnote style={{ position: 'absolute', bottom: 60, width: '100%', textAlign: 'center', fontSize: 15, lineHeight: 1.7, opacity: prog(f, 96, 20) }}>
          Agentic Cinema Hackathon 2026 · Film excerpts: “Sprite Fright” © Blender Foundation | studio.blender.org, CC BY 4.0
          <br />
          All graphics and music generated in code. Inside Out is a trademark of Disney/Pixar, referenced for commentary.
        </Footnote>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};
