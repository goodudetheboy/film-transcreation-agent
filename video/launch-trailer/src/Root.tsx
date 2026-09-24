import React from 'react';
import { Composition } from 'remotion';
import { sec } from './anim';
import { LaunchTrailer, TOTAL_SECONDS } from './LaunchTrailer';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition id="LaunchTrailer" component={LaunchTrailer} durationInFrames={sec(TOTAL_SECONDS)} fps={FPS} width={W} height={H} />
);
