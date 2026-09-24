import React from 'react';
import { AbsoluteFill, Audio, interpolate, Series, staticFile, useVideoConfig } from 'remotion';
import './fonts';
import { sec } from './anim';
import { ChatScene, DiscoverScene, ImportScene, ProjectScene, ResearchScene, VerdictScene } from './scenes/Product';
import { EndCard, Principle, Scale } from './scenes/Outro';
import { BroccoliStory, ColdOpen, Gap, Pressure, TitleReveal, TwoQuestions } from './scenes/Story';

/**
 * Scene list, in seconds. scripts/generate-score.mjs mirrors these cut points
 * (build into the title drop at 57s, breakdown at 148s, final drop at 165s)
 * — keep the two in sync.
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
      <Audio
        src={staticFile('score.wav')}
        volume={(f) => interpolate(f, [0, 10, durationInFrames - 45, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
};
