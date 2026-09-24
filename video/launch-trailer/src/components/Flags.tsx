import React from 'react';

// Hand-drawn simplified national flags. Each draws into its own viewBox and is
// shown sliced to a 3:2 frame.
const star = (cx: number, cy: number, r: number, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.382;
    const a = ((rot + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
};
const hBands = (cols: string[], w = 30, h = 20) =>
  cols.map((c, i) => <rect key={i} x={0} y={(i * h) / cols.length} width={w} height={h / cols.length + 0.05} fill={c} />);
const vBands = (cols: string[], w = 30, h = 20) =>
  cols.map((c, i) => <rect key={i} x={(i * w) / cols.length} y={0} width={w / cols.length + 0.05} height={h} fill={c} />);
const nordic = (bg: string, cross: string, inner?: string) => (
  <>
    <rect width={30} height={20} fill={bg} />
    <rect x={8} y={0} width={5} height={20} fill={cross} />
    <rect x={0} y={7.5} width={30} height={5} fill={cross} />
    {inner && <rect x={9.5} y={0} width={2} height={20} fill={inner} />}
    {inner && <rect x={0} y={9} width={30} height={2} fill={inner} />}
  </>
);

type FlagDef = { name: string; vb?: string; body: React.ReactNode };

export const FLAGS: Record<string, FlagDef> = {
  JP: { name: 'Japan', body: <><rect width={30} height={20} fill="#fff" /><circle cx={15} cy={10} r={6} fill="#bc002d" /></> },
  DE: { name: 'Germany', body: hBands(['#000', '#dd0000', '#ffce00']) },
  IN: {
    name: 'India',
    body: (
      <>
        {hBands(['#ff9933', '#ffffff', '#138808'])}
        <circle cx={15} cy={10} r={2.6} fill="none" stroke="#000080" strokeWidth={0.45} />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 12;
          return <line key={i} x1={15 - 2.6 * Math.cos(a)} y1={10 - 2.6 * Math.sin(a)} x2={15 + 2.6 * Math.cos(a)} y2={10 + 2.6 * Math.sin(a)} stroke="#000080" strokeWidth={0.18} />;
        })}
      </>
    ),
  },
  GB: {
    name: 'United Kingdom',
    vb: '0 0 60 30',
    body: (
      <>
        <rect width={60} height={30} fill="#012169" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth={6} />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#c8102e" strokeWidth={2} />
        <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth={10} />
        <path d="M30 0 V30 M0 15 H60" stroke="#c8102e" strokeWidth={6} />
      </>
    ),
  },
  VN: { name: 'Vietnam', body: <><rect width={30} height={20} fill="#da251d" /><polygon points={star(15, 10.4, 6)} fill="#ffff00" /></> },
  FR: { name: 'France', body: vBands(['#002654', '#ffffff', '#ce1126']) },
  IT: { name: 'Italy', body: vBands(['#009246', '#ffffff', '#ce2b37']) },
  BR: {
    name: 'Brazil',
    body: (
      <>
        <rect width={30} height={20} fill="#009c3b" />
        <polygon points="15,2 28,10 15,18 2,10" fill="#ffdf00" />
        <circle cx={15} cy={10} r={4.6} fill="#002776" />
        <path d="M10.6 9 Q15 7.6 19.5 10.8" stroke="#fff" strokeWidth={0.8} fill="none" />
      </>
    ),
  },
  US: {
    name: 'United States',
    vb: '0 0 38 20',
    body: (
      <>
        {Array.from({ length: 13 }).map((_, i) => (
          <rect key={i} x={0} y={(i * 20) / 13} width={38} height={20 / 13 + 0.02} fill={i % 2 ? '#fff' : '#b22234'} />
        ))}
        <rect width={15.2} height={10.77} fill="#3c3b6e" />
        {Array.from({ length: 9 }).map((_, r) =>
          Array.from({ length: r % 2 ? 5 : 6 }).map((__, c) => (
            <circle key={`${r}-${c}`} cx={1.27 + c * 2.53 + (r % 2 ? 1.27 : 0)} cy={1.08 + r * 1.08} r={0.42} fill="#fff" />
          )),
        )}
      </>
    ),
  },
  CN: {
    name: 'China',
    body: (
      <>
        <rect width={30} height={20} fill="#de2910" />
        <polygon points={star(5, 5, 3)} fill="#ffde00" />
        {[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y], i) => (
          <polygon key={i} points={star(x, y, 1)} fill="#ffde00" />
        ))}
      </>
    ),
  },
  SE: { name: 'Sweden', body: nordic('#006aa7', '#fecc00') },
  DK: { name: 'Denmark', body: nordic('#c8102e', '#ffffff') },
  FI: { name: 'Finland', body: nordic('#ffffff', '#002f6c') },
  NO: { name: 'Norway', body: nordic('#ba0c2f', '#ffffff', '#00205b') },
  CH: {
    name: 'Switzerland',
    body: (
      <>
        <rect width={30} height={20} fill="#da291c" />
        <rect x={13} y={4} width={4} height={12} fill="#fff" />
        <rect x={9} y={8} width={12} height={4} fill="#fff" />
      </>
    ),
  },
  PL: { name: 'Poland', body: hBands(['#ffffff', '#dc143c']) },
  ID: { name: 'Indonesia', body: hBands(['#ce1126', '#ffffff']) },
  TH: { name: 'Thailand', body: hBands(['#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931']) },
  NG: { name: 'Nigeria', body: vBands(['#008751', '#ffffff', '#008751']) },
  IE: { name: 'Ireland', body: vBands(['#169b62', '#ffffff', '#ff883e']) },
  BE: { name: 'Belgium', body: vBands(['#000000', '#fdda24', '#ef3340']) },
  NL: { name: 'Netherlands', body: hBands(['#ae1c28', '#ffffff', '#21468b']) },
  AT: { name: 'Austria', body: hBands(['#c8102e', '#ffffff', '#c8102e']) },
  UA: { name: 'Ukraine', body: hBands(['#0057b7', '#ffd700']) },
  CO: {
    name: 'Colombia',
    body: (
      <>
        <rect width={30} height={10} fill="#fcd116" />
        <rect y={10} width={30} height={5} fill="#003893" />
        <rect y={15} width={30} height={5} fill="#ce1126" />
      </>
    ),
  },
  AR: { name: 'Argentina', body: <>{hBands(['#74acdf', '#ffffff', '#74acdf'])}<circle cx={15} cy={10} r={1.9} fill="#f6b40e" /></> },
  CL: {
    name: 'Chile',
    body: (
      <>
        {hBands(['#ffffff', '#d52b1e'])}
        <rect width={10} height={10} fill="#0039a6" />
        <polygon points={star(5, 5.2, 2.6)} fill="#fff" />
      </>
    ),
  },
  GR: {
    name: 'Greece',
    vb: '0 0 27 18',
    body: (
      <>
        {Array.from({ length: 9 }).map((_, i) => (
          <rect key={i} y={i * 2} width={27} height={2.02} fill={i % 2 ? '#fff' : '#0d5eaf'} />
        ))}
        <rect width={10} height={10} fill="#0d5eaf" />
        <rect x={4} width={2} height={10} fill="#fff" />
        <rect y={4} width={10} height={2} fill="#fff" />
      </>
    ),
  },
  BD: { name: 'Bangladesh', body: <><rect width={30} height={20} fill="#006a4e" /><circle cx={13.5} cy={10} r={6} fill="#f42a41" /></> },
  HU: { name: 'Hungary', body: hBands(['#ce2939', '#ffffff', '#477050']) },
  RO: { name: 'Romania', body: vBands(['#002b7f', '#fcd116', '#ce1126']) },
  ES: {
    name: 'Spain',
    body: (
      <>
        <rect width={30} height={20} fill="#aa151b" />
        <rect y={5} width={30} height={10} fill="#f1bf00" />
      </>
    ),
  },
  TR: {
    name: 'Türkiye',
    body: (
      <>
        <rect width={30} height={20} fill="#e30a17" />
        <circle cx={11.2} cy={10} r={5} fill="#fff" />
        <circle cx={12.5} cy={10} r={4} fill="#e30a17" />
        <polygon points={star(18, 10, 2.1, 180)} fill="#fff" />
      </>
    ),
  },
};

export const Flag: React.FC<{ code: string; w?: number; radius?: number; style?: React.CSSProperties }> = ({
  code,
  w = 36,
  radius = 4,
  style,
}) => {
  const def = FLAGS[code];
  return (
    <svg
      width={w}
      height={(w * 2) / 3}
      viewBox={def.vb ?? '0 0 30 20'}
      preserveAspectRatio="xMidYMid slice"
      style={{ borderRadius: radius, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', flexShrink: 0, ...style }}
    >
      {def.body}
    </svg>
  );
};
