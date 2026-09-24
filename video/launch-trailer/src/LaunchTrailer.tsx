import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import './fonts';
import { sec } from './anim';
import { ChatScene, DiscoverScene, ImportScene, ProjectScene, ResearchScene, VerdictScene } from './scenes/Product';
import { EndCard, Principle, Scale } from './scenes/Outro';
import { BroccoliStory, ColdOpen, Gap, Pressure, TitleReveal, TwoQuestions } from './scenes/Story';

/**
 * Scene list, in seconds. scripts/generate-score.mjs mirrors these cut points
 * (every cut lands on a downbeat with a transition hit; drops at 57s and 165s)
 * and CUTS below flashes on them — keep all three in sync.
 */
export const SCENES: [React.FC<{ dur: number }>, number][] = [
  [ColdOpen, 10],
  [BroccoliStory, 14],
  [TwoQuestions, 10],
  [Pressure, 12],
  [Gap, 11],
  [TitleReveal, 7],
  [ImportScene, 11],
  [DiscoverScene, 17],
  [ProjectScene, 12],
  [ResearchScene, 17],
  [VerdictScene, 15],
  [ChatScene, 12],
  [Principle, 8],
  [Scale, 9],
  [EndCard, 9],
];

/**
 * Visual half of the transition beat: a light sweep + brief flash that peaks
 * exactly on the cut, where the score lands its crash (see transitionHit in
 * scripts/generate-score.mjs).
 */
const CutFlash: React.FC<{ strength: number }> = ({ strength }) => {
  const f = useCurrentFrame(); // cut happens at f = 8
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const x = interpolate(f, [0, 16], [-700, 2600], clamp);
  const flash = interpolate(f, [6, 8, 15], [0, 0.16, 0], clamp) * strength;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: '#d6e6ff', opacity: flash }} />
      <div
        style={{
          position: 'absolute',
          top: -200,
          bottom: -200,
          left: x - 350,
          width: 700,
          transform: 'skewX(-18deg)',
          background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.28), rgba(220,235,255,0.55), rgba(59,130,246,0.28), transparent)',
          mixBlendMode: 'screen',
          opacity: strength,
        }}
      />
    </AbsoluteFill>
  );
};

// [cut second, strength] — feature cuts get the full sweep, story cuts a lighter one
const CUTS: [number, number][] = [
  [10, 0.5], [24, 0.5], [34, 0.5], [46, 0.5],
  [64, 1], [75, 1], [92, 1], [104, 1], [121, 1], [136, 1], [148, 0.7], [156, 0.6],
];

export const TOTAL_SECONDS = SCENES.reduce((s, [, d]) => s + d, 0);

export const LaunchTrailer: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        {SCENES.map(([Scene, s], i) => (
          <Series.Sequence key={i} durationInFrames={sec(s)}>
            <Scene dur={sec(s)} />
          </Series.Sequence>
        ))}
      </Series>
      {CUTS.map(([t, k]) => (
        <Sequence key={t} from={sec(t) - 8} durationInFrames={16} layout="none">
          <CutFlash strength={k} />
        </Sequence>
      ))}
      <Audio
        src={staticFile('score.wav')}
        volume={(f) => interpolate(f, [0, 10, durationInFrames - 45, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
};
