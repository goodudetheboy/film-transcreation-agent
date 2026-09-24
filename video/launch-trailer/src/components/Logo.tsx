import React from 'react';
import { C, FONT } from '../theme';

/**
 * TranscreAI mark: two cultures as overlapping circles; the shared lens —
 * where a line actually resonates — is the lit part.
 * `converge` 0 → circles apart, 1 → locked in place. `lens` fades the lens fill.
 */
export const LogoMark: React.FC<{ size?: number; converge?: number; lens?: number; glow?: number }> = ({
  size = 64,
  converge = 1,
  lens = 1,
  glow = 0,
}) => {
  const off = (1 - converge) * 34;
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 100 64" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lensGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9cc2ff" />
          <stop offset="1" stopColor={C.accent} />
        </linearGradient>
        <filter id="lensGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <circle cx={38 - off} cy={32} r={24} fill="none" stroke={C.text} strokeWidth={3.2} opacity={0.92} />
      <circle cx={62 + off} cy={32} r={24} fill="none" stroke={C.accent} strokeWidth={3.2} />
      {glow > 0 && (
        <path
          d="M50 11.22 A24 24 0 0 1 50 52.78 A24 24 0 0 1 50 11.22 Z"
          fill={C.accent}
          filter="url(#lensGlow)"
          opacity={glow * lens}
        />
      )}
      <path d="M50 11.22 A24 24 0 0 1 50 52.78 A24 24 0 0 1 50 11.22 Z" fill="url(#lensGrad)" opacity={lens} />
    </svg>
  );
};

export const Wordmark: React.FC<{ size?: number; spacing?: number; color?: string }> = ({
  size = 40,
  spacing = -0.02,
  color = C.text,
}) => (
  <span style={{ fontFamily: FONT, fontSize: size, letterSpacing: `${spacing}em`, color, lineHeight: 1 }}>
    <span style={{ fontWeight: 500 }}>Transcre</span>
    <span style={{ fontWeight: 900, color: C.accent }}>AI</span>
  </span>
);
