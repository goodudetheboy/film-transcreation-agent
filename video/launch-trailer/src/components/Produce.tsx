import React from 'react';

/*
 * Photoreal-leaning produce, pure SVG.
 *
 * Broccoli: a crown of domed florets, each covered in flower buds laid out on
 * a golden-angle (phyllotaxis) spiral, the way real broccoli beads pack. Every
 * bud is shaded from its position on a hemisphere against a key light from
 * the upper left, so the dome reads as a lit 3D surface without raster images.
 *
 * Bell pepper: glossy lobed body built from a radial body gradient, crease
 * shadows between lobes, layered specular streaks, a cool rim light, a
 * shoulder cavity, a sepal calyx and a stem with a cut end.
 */

const LIGHT = (() => {
  const v = [-0.55, -0.62, 0.56];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
})();

const mix = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const SHADOW = [18, 44, 16];
const MID = [70, 128, 44];
const LIT = [168, 214, 104];
const shade = (l: number) => (l < 0.5 ? mix(SHADOW, MID, l / 0.5) : mix(MID, LIT, (l - 0.5) / 0.5));

type Dome = [number, number, number];
// back → front so nearer florets overlap farther ones
const DOMES: Dome[] = [
  [140, 118, 60],
  [262, 116, 62],
  [201, 88, 64],
  [104, 168, 54],
  [298, 166, 54],
  [166, 176, 66],
  [240, 180, 64],
  [203, 206, 46],
];

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// deterministic jitter so the bead packing looks grown, not stamped
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const budsFor = ([cx, cy, r]: Dome, di: number) => {
  const n = Math.round(r * 3.3);
  const buds: { x: number; y: number; s: number; fill: string; hl: string; hx: number; hy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const rr = Math.min(r * 0.98, Math.sqrt((i + 0.5) / n) * r * 0.97 + (rand() - 0.5) * r * 0.05);
    const a = i * GOLDEN + di + (rand() - 0.5) * 0.35;
    const dx = Math.cos(a) * rr;
    const dy = Math.sin(a) * rr;
    const nx = dx / r;
    const ny = dy / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lambert = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    // ambient occlusion toward the bottom and rim of each dome
    const ao = 0.55 + 0.45 * nz;
    const l = Math.min(1, (0.12 + 0.95 * lambert) * ao * (0.9 + rand() * 0.2));
    const s = r * (0.07 + 0.04 * (rr / r)) * (0.8 + rand() * 0.4); // buds grow toward the rim
    const c = shade(l);
    buds.push({
      x: cx + dx,
      y: cy + dy * 0.92,
      s,
      fill: rgb(c),
      hl: rgb(mix(c, [230, 245, 200], 0.45)),
      hx: -s * 0.3,
      hy: -s * 0.34,
    });
  }
  return buds;
};

const STALK = [
  'M164 414 C168 360 164 300 150 250 L250 250 C236 300 232 360 236 414 Z',
  'M156 270 C140 242 120 218 98 194 L118 180 C140 206 162 228 180 254 Z',
  'M244 270 C260 242 280 218 302 194 L282 180 C260 206 238 228 220 254 Z',
  'M184 262 C182 230 178 196 170 168 L192 164 C198 196 202 230 206 262 Z',
  'M212 262 C216 232 222 206 234 176 L254 184 C242 210 234 236 230 262 Z',
];

const CROWN = DOMES.map((d, i) => ({ d, buds: budsFor(d, i * 0.7) }));

export const Broccoli3D: React.FC<{ size?: number }> = ({ size = 380 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 400 440" style={{ overflow: 'visible' }}>
    <defs>
      <linearGradient id="bStalk" x1="0" x2="1">
        <stop offset="0" stopColor="#5b7f37" />
        <stop offset="0.28" stopColor="#a9cc7e" />
        <stop offset="0.45" stopColor="#d4e9b2" />
        <stop offset="0.72" stopColor="#95b96a" />
        <stop offset="1" stopColor="#4a6a2b" />
      </linearGradient>
      <radialGradient id="bPool" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#bfe8b0" stopOpacity="0.16" />
        <stop offset="1" stopColor="#bfe8b0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="bCut" cx="0.45" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#eef6d9" />
        <stop offset="0.7" stopColor="#cfe2a6" />
        <stop offset="1" stopColor="#8fb35f" />
      </radialGradient>
      <radialGradient id="bAO" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.55" stopColor="#0b1d09" stopOpacity="0.9" />
        <stop offset="1" stopColor="#0b1d09" stopOpacity="0" />
      </radialGradient>
      <filter id="bSoft" x="-60%" y="-300%" width="220%" height="700%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <linearGradient id="bCanopy" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0b1d09" stopOpacity="0.85" />
        <stop offset="0.45" stopColor="#0b1d09" stopOpacity="0.25" />
        <stop offset="1" stopColor="#0b1d09" stopOpacity="0" />
      </linearGradient>
      <clipPath id="bStalkClip">
        {STALK.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </clipPath>
      <filter id="bFiber">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.35" numOctaves="2" seed="4" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0 0.1  0 0 0 0.35 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
    </defs>

    {/* contact shadow */}
    <ellipse cx={200} cy={418} rx={190} ry={34} fill="url(#bPool)" />
    <ellipse cx={200} cy={419} rx={70} ry={9} fill="#000" opacity={0.75} filter="url(#bSoft)" />

    {/* stalk + branches */}
    <g>
      {STALK.map((d, i) => (
        <path key={i} d={d} fill="url(#bStalk)" />
      ))}
      <g clipPath="url(#bStalkClip)">
        <rect x={80} y={170} width={240} height={250} fill="#fff" filter="url(#bFiber)" opacity={0.55} />
        {/* canopy shadow falling on the upper stalk */}
        <rect x={80} y={170} width={240} height={250} fill="url(#bCanopy)" />
      </g>
      <ellipse cx={200} cy={414} rx={34} ry={9} fill="url(#bCut)" />
      <ellipse cx={200} cy={414} rx={20} ry={5} fill="none" stroke="#a6c77a" strokeWidth={1.5} opacity={0.7} />
    </g>

    {/* crown: per-dome occlusion, then phyllotaxis buds */}
    {CROWN.map(({ d: [cx, cy, r], buds }, i) => (
      <g key={i}>
        <ellipse cx={cx + 6} cy={cy + 10} rx={r * 1.08} ry={r * 1.02} fill="url(#bAO)" />
        <circle cx={cx} cy={cy} r={r * 0.98} fill={rgb(SHADOW)} />
        {buds.map((b, j) => (
          <g key={j}>
            <circle cx={b.x} cy={b.y} r={b.s} fill={b.fill} />
            <circle cx={b.x + b.hx} cy={b.y + b.hy} r={b.s * 0.42} fill={b.hl} opacity={0.75} />
          </g>
        ))}
      </g>
    ))}
  </svg>
);

export const Pepper3D: React.FC<{ size?: number }> = ({ size = 380 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 400 440" style={{ overflow: 'visible' }}>
    <defs>
      <radialGradient id="pPool" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#bfe8b0" stopOpacity="0.16" />
        <stop offset="1" stopColor="#bfe8b0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pBody" cx="0.36" cy="0.34" r="0.78">
        <stop offset="0" stopColor="#86d96a" />
        <stop offset="0.3" stopColor="#3fa243" />
        <stop offset="0.68" stopColor="#1b6a2c" />
        <stop offset="1" stopColor="#0a3515" />
      </radialGradient>
      <linearGradient id="pSide" x1="0" x2="1">
        <stop offset="0" stopColor="#051f0b" stopOpacity="0.55" />
        <stop offset="0.25" stopColor="#051f0b" stopOpacity="0" />
        <stop offset="0.72" stopColor="#051f0b" stopOpacity="0" />
        <stop offset="1" stopColor="#051f0b" stopOpacity="0.7" />
      </linearGradient>
      <radialGradient id="pCavity" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#06260d" stopOpacity="0.95" />
        <stop offset="1" stopColor="#06260d" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="pStem" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#3b5a1a" />
        <stop offset="0.5" stopColor="#7e9d3c" />
        <stop offset="1" stopColor="#4c6d22" />
      </linearGradient>
      <radialGradient id="pCalyx" cx="0.45" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#7fae45" />
        <stop offset="1" stopColor="#2c5117" />
      </radialGradient>
      <clipPath id="pClip">
        <path id="pShape" d="M200 118 C150 104 92 118 78 176 C66 228 76 300 104 352 C120 382 146 398 164 390 C178 384 186 398 200 400 C214 398 222 384 236 390 C254 398 280 382 296 352 C324 300 334 228 322 176 C308 118 250 104 200 118 Z" />
      </clipPath>
      <filter id="pB2"><feGaussianBlur stdDeviation="2" /></filter>
      <filter id="pB5"><feGaussianBlur stdDeviation="5" /></filter>
      <filter id="pB9" x="-60%" y="-300%" width="220%" height="700%"><feGaussianBlur stdDeviation="9" /></filter>
    </defs>

    <ellipse cx={200} cy={412} rx={200} ry={36} fill="url(#pPool)" />
    <ellipse cx={200} cy={406} rx={105} ry={10} fill="#000" opacity={0.75} filter="url(#pB9)" />

    <g clipPath="url(#pClip)">
      <rect x={0} y={0} width={400} height={440} fill="url(#pBody)" />
      <rect x={60} y={90} width={280} height={320} fill="url(#pSide)" />
      {/* lobe creases and the ridge highlights beside them */}
      <path d="M150 128 C130 200 134 300 162 392" stroke="#041c09" strokeWidth={14} fill="none" opacity={0.55} filter="url(#pB5)" />
      <path d="M252 128 C272 200 268 300 240 392" stroke="#041c09" strokeWidth={14} fill="none" opacity={0.6} filter="url(#pB5)" />
      <path d="M140 132 C120 204 124 300 150 386" stroke="#b8f59a" strokeWidth={4} fill="none" opacity={0.18} filter="url(#pB2)" />
      <path d="M200 380 C200 392 200 398 200 402" stroke="#041c09" strokeWidth={10} opacity={0.5} filter="url(#pB5)" />
      {/* bottom falloff */}
      <ellipse cx={200} cy={420} rx={170} ry={60} fill="#041c09" opacity={0.5} filter="url(#pB9)" />
      {/* specular: broad soft sheen, then sharp glints */}
      <path d="M108 188 C98 240 104 300 124 344" stroke="#ffffff" strokeWidth={18} strokeLinecap="round" fill="none" opacity={0.28} filter="url(#pB5)" />
      <path d="M118 178 C110 204 110 228 116 250" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.85} filter="url(#pB2)" />
      <path d="M124 272 C126 286 130 298 136 310" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.55} filter="url(#pB2)" />
      <path d="M196 158 C188 200 190 244 198 276" stroke="#e9ffe0" strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.3} filter="url(#pB5)" />
      <path d="M232 150 C240 160 246 170 250 182" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.6} filter="url(#pB2)" />
      {/* cool rim light from the backdrop */}
      <path d="M322 186 C332 246 322 316 296 356" stroke="#9fd0ff" strokeWidth={5} fill="none" opacity={0.35} filter="url(#pB2)" />
      {/* shoulder cavity */}
      <ellipse cx={202} cy={128} rx={70} ry={26} fill="url(#pCavity)" />
    </g>

    {/* calyx */}
    <path
      d="M200 112 C186 112 170 118 164 128 C176 126 184 132 186 138 C192 132 198 134 202 140 C206 134 214 132 220 138 C222 130 232 126 242 128 C234 118 216 112 200 112 Z"
      fill="url(#pCalyx)"
    />
    {/* stem */}
    <path d="M192 124 C186 96 196 68 222 50 L238 62 C216 78 208 102 212 126 Z" fill="url(#pStem)" />
    <path d="M198 118 C194 96 202 76 222 60" stroke="#c9e08c" strokeWidth={3} fill="none" opacity={0.5} filter="url(#pB2)" />
    <ellipse cx={230} cy={56} rx={10} ry={5.5} transform="rotate(-38 230 56)" fill="#d4e39a" stroke="#6b8a2c" strokeWidth={1.5} />
  </svg>
);
