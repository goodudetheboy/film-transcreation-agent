import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CLAMP, easeInOut, lerp, mmss, prog, typed } from '../anim';
import { Flag, FLAGS } from '../components/Flags';
import {
  AppWindow,
  Backdrop,
  Badge,
  Button,
  Callout,
  Check,
  Cursor,
  DetailBlock,
  Eyebrow,
  Grain,
  Panel,
  Player,
  ProgressBar,
  Spinner,
  StepHeader,
  TimelineTracks,
  Vignette,
  WorkspaceTitle,
} from '../components/ui';
import { C, FONT } from '../theme';

// Window content origin in scene coordinates (AppWindow at 120,228 + 60px header + 1px border).
const OX = 121;
const OY = 289;
const at = (x: number, y: number) => ({ x: OX + x, y: OY + y });

const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <Backdrop />
    {children}
    <Vignette strength={0.45} />
    <Grain opacity={0.04} />
  </AbsoluteFill>
);

const Field: React.FC<{ label: string; top: number; h?: number; children: React.ReactNode; focus?: boolean }> = ({ label, top, h = 52, children, focus }) => (
  <>
    <Eyebrow style={{ position: 'absolute', left: 32, top: top - 24 }}>{label}</Eyebrow>
    <div
      style={{
        position: 'absolute',
        left: 32,
        right: 32,
        top,
        height: h,
        borderRadius: 10,
        border: `1px solid ${focus ? C.accent : C.border}`,
        boxShadow: focus ? `0 0 0 3px ${C.accentSoft}` : undefined,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        fontSize: 18,
        gap: 12,
      }}
    >
      {children}
    </div>
  </>
);

const FileIcon: React.FC<{ kind: 'video' | 'text' }> = ({ kind }) => (
  <svg width={26} height={26} viewBox="0 0 24 24">
    <path d="M6 2.5 H14 L19 7.5 V21.5 H6 Z" fill="none" stroke={C.dim} strokeWidth={1.5} strokeLinejoin="round" />
    <path d="M14 2.5 V7.5 H19" fill="none" stroke={C.dim} strokeWidth={1.5} />
    {kind === 'video' ? <path d="M10 11 L15 14 L10 17 Z" fill={C.accent} /> : <path d="M9 12 H16 M9 15 H16 M9 18 H13" stroke={C.accent} strokeWidth={1.5} />}
  </svg>
);

/* ================================================================== */
/* 01 — IMPORT                                                        */
/* ================================================================== */
export const ImportScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const up = interpolate(f, [58, 140], [0, 1], { ...CLAMP, easing: easeInOut });
  const phaseB = prog(f, 158, 22, easeInOut);
  const title = typed('Sprite Fright', f, 36, 18);
  const chk = prog(f, 104, 8);
  const btn = f >= 146 && f < 156 ? 1 : 0;
  const stageAt = [0, 0, 170, 262, 300];
  const stages = ['Upload video', 'Upload script', 'Discovery scan', 'Finalize', 'Ready'];
  const cur = stageAt.filter((s) => f >= s).length - 1;
  const sweep = ((f - 170) % 60) / 60;
  const cardBox = { X: 40, Y: 30 };
  return (
    <Scene>
      <StepHeader num="01" label="IMPORT" title="Bring in a film and its script." sub="Video plus .srt or .vtt. Feature-length masters go straight to cloud storage via resumable upload." end={dur} />
      <AppWindow nav="Films" exit={dur}>
        {/* Phase A — import form */}
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - phaseB }}>
          <Panel style={{ position: 'absolute', left: cardBox.X, top: cardBox.Y, width: 800, height: 680, background: C.panel }}>
            <div style={{ position: 'absolute', left: 32, top: 26, fontSize: 28, fontWeight: 700 }}>Import a new film</div>
            <Field label="Title" top={120} focus={f > 34 && f < 60}>
              {title}
              {f > 34 && f < 60 && <span style={{ width: 2, height: 22, background: C.accent }} />}
            </Field>
            <Field label="Video" top={220} h={96}>
              {f < 52 ? (
                <span style={{ color: C.faint }}>Drop a video file or paste a URL</span>
              ) : (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <FileIcon kind="video" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500 }}>sprite_fright_master.mp4</span>
                      <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{up < 1 ? `${Math.round(up * 107)} / 107 MB` : '107 MB'}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <ProgressBar p={up} w="100%" color={up >= 1 ? C.success : C.accent} />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: C.faint }}>{up < 1 ? 'Direct to Cloud Storage · resumable, chunked' : 'Uploaded · size verified'}</div>
                  </div>
                </div>
              )}
            </Field>
            <Field label="Subtitles" top={360} h={64}>
              {f < 76 ? (
                <span style={{ color: C.faint }}>.srt or .vtt</span>
              ) : (
                <>
                  <FileIcon kind="text" />
                  <span style={{ fontWeight: 500 }}>sprite_fright_en.srt</span>
                  <span style={{ marginLeft: 'auto', color: C.dim }}>82 lines parsed</span>
                  <Check size={20} p={prog(f, 80, 12)} />
                </>
              )}
            </Field>
            <div style={{ position: 'absolute', left: 32, top: 456, display: 'flex', alignItems: 'center', gap: 14, fontSize: 18 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${chk ? C.accent : C.borderStrong}`, background: chk ? C.accent : 'transparent', display: 'grid', placeItems: 'center' }}>
                {chk > 0 && <Check size={16} color="#fff" p={chk} />}
              </span>
              Run the Discovery agent on import
            </div>
            <div style={{ position: 'absolute', left: 32, right: 32, top: 530 }}>
              <Button primary pressed={btn} style={{ width: '100%', justifyContent: 'center', fontSize: 18, padding: '14px 0' }}>
                Import film
              </Button>
            </div>
          </Panel>
          <div style={{ position: 'absolute', left: 880, top: 30, right: 40 }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 18, opacity: prog(f, 76, 16) }}>Script preview</div>
            {[
              [17.38, 'Hello, Mr.Snail!'],
              [19.46, 'Aw, you cute little cornu aspersum.'],
              [22.33, 'Latin name bonus-points!'],
              [28.38, 'Can’t believe we got stuck with the tree hugger.'],
              [34.0, 'Relax, Sugar Buns. While she does all the work…'],
              [38.13, 'Yeah! And get wasted out of our minds!'],
              [42.58, 'Way ahead of you, man.'],
              [53.67, 'Get it? Because we’re a group of fun guys.'],
            ].map(([t, s], i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 18,
                  padding: '14px 18px',
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 18,
                  opacity: prog(f, 80 + i * 5, 14),
                  transform: `translateX(${(1 - prog(f, 80 + i * 5, 14)) * 20}px)`,
                }}
              >
                <span style={{ color: C.faint, fontVariantNumeric: 'tabular-nums', width: 56 }}>{mmss(t as number)}</span>
                <span style={{ color: C.text }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phase B — preparing */}
        <div style={{ position: 'absolute', inset: 0, opacity: phaseB, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 70 }}>
          <svg width={620} height={220} viewBox="0 0 620 220">
            <defs>
              <linearGradient id="beam" x1="0" x2="1">
                <stop offset="0" stopColor={C.accent} stopOpacity="0" />
                <stop offset="0.5" stopColor={C.accent} stopOpacity="0.55" />
                <stop offset="1" stopColor={C.accent} stopOpacity="0" />
              </linearGradient>
              <clipPath id="strip">
                <rect x={10} y={30} width={600} height={160} rx={10} />
              </clipPath>
            </defs>
            <rect x={10} y={30} width={600} height={160} rx={10} fill={C.panel} stroke={C.borderStrong} />
            <g clipPath="url(#strip)">
              {Array.from({ length: 16 }).map((_, i) => {
                const x = ((i * 90 - (f * 2) % 90) % 1440) - 60;
                return (
                  <g key={i}>
                    <rect x={x} y={40} width={16} height={10} rx={2} fill={C.border} />
                    <rect x={x} y={170} width={16} height={10} rx={2} fill={C.border} />
                    <rect x={x - 26} y={62} width={70} height={96} rx={6} fill="#1b1d24" stroke={C.border} />
                  </g>
                );
              })}
              <rect x={10 + sweep * 600 - 60} y={30} width={120} height={160} fill="url(#beam)" />
            </g>
            {[140, 330, 480].map((x, i) => {
              const p = prog(f, 190 + i * 22, 14);
              return <circle key={i} cx={x} cy={110} r={10 + 8 * p} fill="none" stroke={C.warning} strokeWidth={2.5} opacity={p * (1 - prog(f, 250 + i * 12, 20)) } />;
            })}
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, marginTop: 30 }}>
            {cur < 3 ? 'Discovery agent is scanning dialogue and footage…' : cur === 3 ? 'Finalizing your workspace…' : 'Ready.'}
          </div>
          <div style={{ fontSize: 19, color: C.dim, marginTop: 12 }}>Progress survives a reload: live status is streamed from the server.</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 56 }}>
            {stages.map((s, i) => {
              const done = i < cur || (i === 4 && cur === 4);
              const active = i === cur && !done;
              return (
                <React.Fragment key={s}>
                  {i > 0 && <div style={{ width: 70, height: 2, background: i <= cur ? C.accent : C.border, margin: '0 14px' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, fontWeight: 700, color: done ? C.text : active ? '#8ab4ff' : C.faint }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `2px solid ${done ? C.success : active ? C.accent : C.border}`, background: done ? C.successDim : 'transparent' }}>
                      {done ? <Check size={16} /> : active ? <Spinner size={16} /> : <span style={{ fontSize: 13 }}>{i + 1}</span>}
                    </span>
                    {s}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </AppWindow>
      <Cursor
        show={[10, 165]}
        keys={[
          { f: 0, x: 1300, y: 1000 },
          { f: 28, ...at(cardBox.X + 300, cardBox.Y + 146) },
          { f: 70, ...at(cardBox.X + 300, cardBox.Y + 146) },
          { f: 100, ...at(cardBox.X + 44, cardBox.Y + 468) },
          { f: 124, ...at(cardBox.X + 44, cardBox.Y + 468) },
          { f: 144, ...at(cardBox.X + 400, cardBox.Y + 556) },
        ]}
        clicks={[32, 104, 146]}
      />
    </Scene>
  );
};

/* ================================================================== */
/* 02 — DISCOVER                                                      */
/* ================================================================== */
type Row = { s: number; e: number; sub: string; desc: string; gesture: string; freeform?: boolean };
const DETAIL_ROWS: Row[] = [
  { s: 28.4, e: 30.8, sub: 'Can’t believe we got stuck with the tree hugger.', desc: 'Dismisses a peer as a “tree hugger”: an insult.', gesture: 'Eye-roll toward the group' },
  { s: 34, e: 38.1, sub: 'Relax, Sugar Buns. While she does all the work…', desc: 'Food-based term of endearment between the couple.', gesture: 'Arm around partner' },
  { s: 40, e: 46, sub: '(no dialogue)', desc: 'Antagonist wears a Union Jack T-shirt.', gesture: 'Costume · national flag', freeform: true },
  { s: 53.7, e: 56.2, sub: 'Get it? Because we’re a group of fun guys.', desc: 'Pun: “fungi” / “fun guys”.', gesture: 'Grins, arms wide' },
  { s: 112.6, e: 116.8, sub: 'Yeah. She’s a real weenie that one, innit?', desc: 'British tag question “innit”; “weenie” as insult.', gesture: 'Smirk, thumb toward her' },
  { s: 116.8, e: 119, sub: 'Oy, Phil! How those sausages coming?', desc: 'Campfire BBQ sausages: food culture.', gesture: 'Calls across camp' },
  { s: 187, e: 188.3, sub: 'Get on MTV.', desc: 'Dated brand reference: fame via MTV.', gesture: 'Mimes a camera' },
  { s: 206.3, e: 208.8, sub: 'Could I interest you in some peppermint tea?', desc: 'Tea offered to strangers as a hospitality ritual.', gesture: 'Open-palm welcome' },
  { s: 226.6, e: 231.5, sub: 'Hey, uh, little mushroom geezer…', desc: 'British slang “geezer” aimed at a sprite.', gesture: 'Leans down, patronizing' },
  { s: 303.6, e: 305.3, sub: 'Sprite them!', desc: 'Invented verb “sprite” used as a battle cry.', gesture: 'Staff raised, rallying' },
  { s: 367.1, e: 368.9, sub: 'Sweet cakes!', desc: 'Food-based pet name, shouted in panic.', gesture: 'Reaching out' },
  { s: 437.2, e: 441.1, sub: 'All right, then. Eat salt, you little green…', desc: 'Salt thrown to repel spirits: folklore ritual.', gesture: 'Throwing salt' },
];

const COLS = [
  { k: 'START', w: 78 },
  { k: 'END', w: 78 },
  { k: 'SUBTITLE', w: 300 },
  { k: 'SEGMENT DESCRIPTION', w: 330 },
  { k: 'GESTURE', w: 190 },
];

const DetailsTable: React.FC<{ rows: Row[]; appear: (i: number) => number; w: number; highlight?: number; dimOthers?: number }> = ({ rows, appear, w, highlight, dimOthers = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ width: w, fontSize: 15 }}>
      <div style={{ display: 'flex', padding: '0 14px', height: 38, alignItems: 'center', borderBottom: `1px solid ${C.border}`, color: C.faint, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>
        {COLS.map((c) => (
          <span key={c.k} style={{ width: c.w, flexShrink: 0 }}>{c.k}</span>
        ))}
      </div>
      {rows.map((r, i) => {
        const p = prog(f, appear(i), 14);
        const hl = highlight === i;
        const vals = [mmss(r.s), mmss(r.e), r.sub, r.desc, r.gesture];
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              padding: '0 14px',
              height: 40,
              alignItems: 'center',
              borderBottom: `1px solid ${C.border}`,
              opacity: p * (hl ? 1 : 1 - dimOthers * 0.55),
              transform: `translateY(${(1 - p) * -8}px)`,
              background: hl ? C.accentSoft : p < 1 && p > 0 ? 'rgba(59,130,246,0.18)' : 'transparent',
              boxShadow: hl ? `inset 3px 0 0 ${C.accent}` : undefined,
            }}
          >
            {vals.map((v, j) => (
              <span
                key={j}
                style={{
                  width: COLS[j].w,
                  flexShrink: 0,
                  paddingRight: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: j < 2 ? C.dim : r.freeform && j === 2 ? C.warning : C.text,
                  fontStyle: r.freeform && j === 2 ? 'italic' : undefined,
                  fontVariantNumeric: 'tabular-nums',
                  boxSizing: 'border-box',
                }}
              >
                {v}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export const DiscoverScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const rowAt = (i: number) => 40 + i * 17;
  const scanned = Math.min(63, Math.round(interpolate(f, [30, 250], [8, 63], CLAMP)));
  const done = f > 250;
  const modal = prog(f, 392, 18) * (1 - prog(f, 478, 14));
  const added = prog(f, 482, 14);
  const blocks: DetailBlock[] = DETAIL_ROWS.map((r, i) => ({ s: r.s, e: r.e, color: '#5b8def', at: rowAt(i) }));
  const playhead = f < 170 ? lerp(34, 40, f / 170) : f < 340 ? lerp(40, 46, (f - 170) / 170) : lerp(158, 163, (f - 340) / 170);
  return (
    <Scene>
      <StepHeader num="02" label="DISCOVER" title="It watches the film, not just the script." sub="The Discovery Agent flags anything with narrative weight: lines, props, gestures, on-screen text." end={dur} />
      <AppWindow exit={dur}>
        <WorkspaceTitle tab="DETAILS" />
        <Panel style={{ position: 'absolute', left: 22, top: 112, width: 1000, height: 520 }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderBottom: `1px solid ${C.border}` }}>
            {done ? <Check size={18} /> : <Spinner size={18} />}
            <span style={{ fontWeight: 700, fontSize: 16 }}>Discovery Agent</span>
            <Badge tone={done ? 'success' : 'accent'}>{done ? 'Done' : 'Running'}</Badge>
            <span style={{ color: C.dim, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
              {done ? '14 candidates found' : `Scanning segment ${scanned} / 63 · dialogue + footage`}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Button style={{ fontSize: 14, padding: '6px 12px', color: '#8ab4ff' }}>+ Agents</Button>
            </span>
          </div>
          <DetailsTable rows={DETAIL_ROWS} appear={rowAt} w={1000} highlight={f > 262 && f < 392 ? 2 : undefined} dimOthers={prog(f, 262, 12) * (1 - prog(f, 380, 12))} />
        </Panel>
        <Player
          w={634}
          h={520}
          style={{ position: 'absolute', left: 1036, top: 112 }}
          time={playhead}
          clips={[
            { src: 'sugarbuns', from: 0, dur: 170 },
            { src: 'unionjack', from: 170, dur: 170 },
            { src: 'sprites', from: 340, dur: 170 },
          ]}
          subtitle={f < 128 ? 'Relax, Sugar Buns. While she does all the work we’ll have all the fun.' : f > 250 && f < 330 ? 'Way ahead of you, man.' : undefined}
        />
        <TimelineTracks w={1678} playhead={playhead} details={blocks} subtitlesAt={0} style={{ position: 'absolute', left: 0, top: 648 }} />

        {/* Review queue modal */}
        <div style={{ position: 'absolute', inset: 0, background: `rgba(3,4,5,${0.6 * modal})`, opacity: modal > 0 ? 1 : 0 }}>
          <Panel
            style={{
              position: 'absolute',
              left: 480,
              top: 90,
              width: 720,
              background: C.panel,
              border: `1px solid ${C.borderStrong}`,
              opacity: modal,
              transform: `scale(${0.96 + 0.04 * modal})`,
              padding: 28,
              boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 700 }}>14 details found</div>
            <div style={{ color: C.dim, fontSize: 16, marginTop: 6 }}>Nothing lands in your workspace until you approve it.</div>
            <div style={{ marginTop: 20 }}>
              {DETAIL_ROWS.slice(0, 6).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: `1px solid ${C.border}`, fontSize: 16 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, background: C.accent, display: 'grid', placeItems: 'center' }}>
                    <Check size={14} color="#fff" />
                  </span>
                  <span style={{ color: C.dim, width: 50, fontVariantNumeric: 'tabular-nums' }}>{mmss(r.s)}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc}</span>
                </div>
              ))}
              <div style={{ color: C.faint, fontSize: 15, paddingTop: 10 }}>+ 8 more</div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button>Discard all</Button>
              <Button primary pressed={f >= 458 && f < 468 ? 1 : 0}>Add 14 to Details</Button>
            </div>
          </Panel>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 132,
            opacity: added * (1 - prog(f, dur - 16, 12)),
            transform: `translateY(${(1 - added) * 16}px)`,
          }}
        >
          <Badge tone="success" style={{ fontSize: 16, padding: '10px 16px' }}>✓ 14 details added to the workspace</Badge>
        </div>
      </AppWindow>
      <Callout x={1110} y={372} at={266} until={392} w={660}>
        <Eyebrow color={C.warning}>Freeform findings · no dialogue required</Eyebrow>
        {[
          ['COSTUME', 'Union Jack T-shirt', '00:40', 'A national flag worn by the antagonist.'],
          ['RITUAL', 'Peppermint tea for guests', '03:26', 'Hospitality custom; reads differently by market.'],
          ['GESTURE', 'Salt thrown at the sprites', '07:17', 'Folk ritual to ward off spirits.'],
        ].map(([tag, t, tc, d], i) => (
          <div key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: 16, opacity: prog(f, 280 + i * 12, 14) }}>
            <Badge tone="warning" style={{ fontSize: 12, width: 78, textAlign: 'center' }}>{tag}</Badge>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>
                {t} <span style={{ color: C.faint, fontWeight: 500, fontSize: 16, marginLeft: 6 }}>{tc}</span>
              </div>
              <div style={{ color: C.dim, fontSize: 16, marginTop: 3 }}>{d}</div>
            </div>
          </div>
        ))}
      </Callout>
      <Cursor show={[420, 492]} keys={[{ f: 420, x: 1500, y: 950 }, { f: 452, ...at(1090, 545) }]} clicks={[458]} />
    </Scene>
  );
};

/* ================================================================== */
/* 03 — TARGET                                                        */
/* ================================================================== */
const RUBRICS = [
  ['Food aversion', 'Foods whose associations (loved, hated, taboo) differ in the target market.'],
  ['Cultural institution', 'Customs, rituals and institutions the audience may not share.'],
  ['Slang / meme reference', 'Idioms, slang and memes that may be unknown or already dated.'],
  ['Gesture', 'Hand signs and body language that read differently, or offensively.'],
  ['Holiday reference', 'Holidays, seasons and calendar moments that don’t map.'],
  ['Wordplay', 'Puns, rhymes and double meanings that break in translation.'],
];

export const ProjectScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const phaseB = prog(f, 150, 20, easeInOut);
  const step = f < 150 ? 0 : 2;
  const picked = f >= 92;
  const codes = ['JP', 'DE', 'IN', 'GB', 'VN', 'FR', 'BR', 'ES', 'IT', 'TR', 'ID', 'TH'];
  const MX = 330;
  const MY = 40;
  const research = prog(f, 292, 8);
  return (
    <Scene>
      <StepHeader num="03" label="TARGET" title="Pick a market. Define what “risk” means." sub="Weighted, editable rubrics: an auditable ranking, not a black box." end={dur} />
      <AppWindow exit={dur}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
          <WorkspaceTitle tab="PROJECT" />
        </div>
        <Panel style={{ position: 'absolute', left: MX, top: MY, width: 1020, height: 680, background: C.panel, border: `1px solid ${C.borderStrong}`, boxShadow: '0 30px 90px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', gap: 10, padding: '24px 30px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
            {['Project info', 'Items', 'Rubrics', 'Confirm'].map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <div style={{ width: 40, height: 2, background: i <= step ? C.accent : C.border }} />}
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: i === step ? C.text : i < step ? C.dim : C.faint }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, background: i === step ? C.accent : i < step ? C.successDim : 'transparent', border: `1.5px solid ${i === step ? C.accent : i < step ? C.success : C.border}` }}>
                    {i < step ? <Check size={14} /> : i + 1}
                  </span>
                  {s}
                </span>
              </React.Fragment>
            ))}
          </div>
          {/* Step 1 — country */}
          <div style={{ position: 'absolute', left: 30, right: 30, top: 100, opacity: 1 - phaseB }}>
            <Eyebrow>Target country</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 14 }}>
              {codes.map((c, i) => {
                const sel = picked && c === 'JP';
                return (
                  <div
                    key={c}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: `1.5px solid ${sel ? C.accent : C.border}`,
                      background: sel ? C.accentSoft : C.bg,
                      boxShadow: sel ? `0 0 24px ${C.accentGlow}` : undefined,
                      fontSize: 18,
                      fontWeight: 500,
                      opacity: prog(f, 8 + i * 3, 14),
                    }}
                  >
                    <Flag code={c} w={40} />
                    {FLAGS[c].name}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 30 }}>
              <Eyebrow>Project name</Eyebrow>
              <div style={{ marginTop: 10, height: 52, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 18 }}>
                {typed('Sprite Fright · Japan theatrical', f, 100, 40) || <span style={{ color: C.faint }}>Name this project</span>}
              </div>
            </div>
          </div>
          {/* Step 3 — rubrics */}
          <div style={{ position: 'absolute', left: 30, right: 30, top: 96, opacity: phaseB }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, fontWeight: 700 }}>
                <Flag code="JP" w={32} /> Rubrics for Japan
              </div>
              <Button pressed={f >= 176 && f < 184 ? 1 : 0} style={{ fontSize: 15, color: '#8ab4ff' }}>Use default rubrics</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
              {RUBRICS.map(([n, d], i) => {
                const p = prog(f, 186 + i * 9, 18);
                const wv = Math.round(interpolate(f, [200 + i * 9, 240 + i * 9], [0, 3], CLAMP));
                return (
                  <div key={n} style={{ padding: '16px 18px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 18, fontWeight: 700 }}>
                        <span style={{ color: C.faint, marginRight: 10 }}>{i + 1}</span>
                        {n}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: '0.1em', marginRight: 6 }}>WEIGHT</span>
                        {Array.from({ length: 5 }).map((_, k) => (
                          <span key={k} style={{ width: 9, height: 9, borderRadius: '50%', background: k < wv ? C.accent : C.border }} />
                        ))}
                      </span>
                    </div>
                    <div style={{ color: C.dim, fontSize: 15, marginTop: 8, lineHeight: 1.4 }}>{d}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, fontSize: 17 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${research ? C.accent : C.borderStrong}`, background: research ? C.accent : 'transparent', display: 'grid', placeItems: 'center' }}>
                {research > 0 && <Check size={14} color="#fff" p={research} />}
              </span>
              Kick off agentic research on creation
              <span style={{ marginLeft: 'auto' }}>
                <Button primary pressed={f >= 322 && f < 332 ? 1 : 0}>Create project</Button>
              </span>
            </div>
          </div>
        </Panel>
      </AppWindow>
      <Cursor
        show={[20, dur - 10]}
        keys={[
          { f: 20, x: 1400, y: 980 },
          { f: 84, ...at(MX + 30 + 110, MY + 150) },
          { f: 150, ...at(MX + 30 + 110, MY + 150) },
          { f: 172, ...at(MX + 900, MY + 112) },
          { f: 260, ...at(MX + 900, MY + 112) },
          { f: 288, ...at(MX + 42, MY + 513) },
          { f: 300, ...at(MX + 42, MY + 513) },
          { f: 318, ...at(MX + 920, MY + 513) },
        ]}
        clicks={[90, 176, 292, 322]}
      />
    </Scene>
  );
};

/* ================================================================== */
/* 04 — RESEARCH                                                      */
/* ================================================================== */
type Item = { s: number; sub: string; imp: number; needs: boolean };
const ITEMS: Item[] = [
  { s: 28.4, sub: 'Can’t believe we got stuck with the tree hugger.', imp: 2.2, needs: false },
  { s: 34, sub: 'Relax, Sugar Buns. While she does all the work…', imp: 3.8, needs: true },
  { s: 53.7, sub: 'Get it? Because we’re a group of fun guys.', imp: 4.1, needs: true },
  { s: 112.6, sub: 'Yeah. She’s a real weenie that one, innit?', imp: 3.1, needs: true },
  { s: 116.8, sub: 'Oy, Phil! How those sausages coming?', imp: 2.9, needs: true },
  { s: 187, sub: 'Get on MTV.', imp: 2.6, needs: true },
  { s: 206.3, sub: 'Could I interest you in some peppermint tea?', imp: 1.2, needs: false },
  { s: 226.6, sub: 'Hey, uh, little mushroom geezer…', imp: 3.4, needs: true },
  { s: 303.6, sub: 'Sprite them!', imp: 4.5, needs: true },
  { s: 367.1, sub: 'Sweet cakes!', imp: 4.2, needs: true },
  { s: 426.4, sub: 'Son of a Spriteberry!', imp: 3.7, needs: true },
];
const SORTED = [...ITEMS.keys()].sort((a, b) => ITEMS[b].imp - ITEMS[a].imp);

const SCORES: [string, number][] = [
  ['Food aversion', 8],
  ['Cultural institution', 8],
  ['Slang / meme reference', 7],
  ['Gesture', 0],
  ['Holiday reference', 0],
  ['Wordplay', 0],
];

export const Gauge: React.FC<{ value: number; size?: number; p?: number }> = ({ value, size = 110, p = 1 }) => {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const v = value * p;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke={C.border} strokeWidth={7} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={C.success} strokeWidth={7} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 10)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: size * 0.26, fontWeight: 900, color: C.success, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(1)}</div>
          <div style={{ fontSize: size * 0.09, color: C.faint, fontWeight: 700 }}>/10</div>
        </div>
      </div>
    </div>
  );
};

const QueryCard: React.FC<{ at: number; q: string; n: number }> = ({ at: a, q, n }) => {
  const f = useCurrentFrame();
  const p = prog(f, a, 18);
  const done = f > a + 60;
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, border: `1px solid ${done ? C.border : C.accentDim}`, background: C.bg, marginBottom: 14, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {done ? <Check size={18} /> : <Spinner size={18} />}
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: C.faint }}>LIVE WEB SEARCH · PARALLEL</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: done ? C.success : C.dim }}>{done ? `${n} sources cited` : 'searching…'}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, marginTop: 10 }}>{q}</div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0.82, 0.64, 0.73].map((w, i) => {
          const pp = prog(f, a + 22 + i * 10, 16);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: pp }}>
              <svg width={14} height={14} viewBox="0 0 20 20">
                <path d="M8 12 L12 8 M7 9.5 L5 11.5 A3 3 0 0 0 9.5 16 L11.5 14 M13 10.5 L15 8.5 A3 3 0 0 0 10.5 4 L8.5 6" fill="none" stroke={C.accent} strokeWidth={1.6} strokeLinecap="round" />
              </svg>
              <div style={{ height: 8, width: `${w * 100 * pp}%`, borderRadius: 4, background: '#262a36' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ResearchScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const scoredAt = (i: number) => 40 + i * 20;
  const nScored = ITEMS.filter((_, i) => f >= scoredAt(i)).length;
  const sortP = prog(f, 272, 36, easeInOut);
  const phaseB = prog(f, 330, 22, easeInOut);
  const rowH = 44;
  return (
    <Scene>
      <StepHeader num="04" label="RESEARCH" title="Every score grounded in live evidence." sub="The Research Agent scores each detail against every rubric, backed by real-time web search, not model memory." end={dur} />
      <AppWindow exit={dur}>
        <WorkspaceTitle tab="PROJECT" projectFlag="JAPAN" />
        <Panel style={{ position: 'absolute', left: 22, top: 112, width: 1000, height: 634 }}>
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Flag code="JP" w={30} />
              <span style={{ fontSize: 20, fontWeight: 700 }}>Project: Japan</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                {nScored < ITEMS.length ? <Spinner size={16} /> : <Check size={16} />}
                Research Agent · {nScored < ITEMS.length ? `batch ${Math.min(4, 1 + Math.floor(nScored / 3))} of 4` : 'done'} · {nScored}/{ITEMS.length} scored
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <ProgressBar p={nScored / ITEMS.length} w="100%" color={nScored === ITEMS.length ? C.success : C.accent} />
            </div>
          </div>
          <div style={{ display: 'flex', padding: '0 18px', height: 38, alignItems: 'center', color: C.faint, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 80 }}>START</span>
            <span style={{ width: 120 }}>IMPORTANCE ↓</span>
            <span style={{ flex: 1 }}>SUBTITLE</span>
            <span style={{ width: 170 }}>AI ASSESSMENT</span>
            <span style={{ width: 120 }}>YOUR VERDICT</span>
          </div>
          <div style={{ position: 'relative', height: rowH * ITEMS.length }}>
            {ITEMS.map((it, i) => {
              const scored = f >= scoredAt(i);
              const sp = prog(f, scoredAt(i), 16);
              const y = lerp(i, SORTED.indexOf(i), sortP) * rowH;
              const hl = i === 1 && phaseB > 0;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: y,
                    left: 0,
                    right: 0,
                    height: rowH,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 18px',
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 16,
                    background: hl ? C.accentSoft : sp > 0 && sp < 1 ? 'rgba(59,130,246,0.14)' : 'transparent',
                    boxShadow: hl ? `inset 3px 0 0 ${C.accent}` : `inset 3px 0 0 ${scored && it.needs ? C.danger : 'transparent'}`,
                    opacity: phaseB > 0 && !hl ? 1 - phaseB * 0.5 : 1,
                  }}
                >
                  <span style={{ width: 80, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{mmss(it.s)}</span>
                  <span style={{ width: 120, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: it.imp >= 3.5 ? C.text : C.dim }}>{scored ? (it.imp * sp).toFixed(1) : '—'}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 16 }}>{it.sub}</span>
                  <span style={{ width: 170 }}>
                    {scored ? <Badge tone={it.needs ? 'danger' : 'success'} style={{ opacity: sp }}>{it.needs ? 'needs change' : 'fine as-is'}</Badge> : <span style={{ color: C.faint }}>…</span>}
                  </span>
                  <span style={{ width: 120 }}>
                    <Badge tone="warning">pending</Badge>
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Right: live research feed → rubric breakdown */}
        <div style={{ position: 'absolute', left: 1040, top: 112, width: 630, height: 634 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 1 - phaseB }}>
            <Eyebrow style={{ marginBottom: 14 }}>Live research</Eyebrow>
            <QueryCard at={50} q="“Sugar Buns”: is a food-based pet name natural in Japanese?" n={4} />
            <QueryCard at={130} q="Recognition of British slang “innit” among Japanese viewers" n={5} />
            <QueryCard at={210} q="Is MTV still a fame reference for audiences in Japan?" n={3} />
          </div>
          <Panel style={{ position: 'absolute', inset: 0, opacity: phaseB, background: C.panel, padding: 24, transform: `translateX(${(1 - phaseB) * 30}px)` }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.dim, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>00:34 – 00:39</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>Relax, Sugar Buns. While she does all the work we’ll have all the fun.</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Gauge value={3.8} size={116} p={prog(f, 350, 50, easeInOut)} />
                <Eyebrow style={{ marginTop: 4 }}>Importance</Eyebrow>
              </div>
            </div>
            <div style={{ marginTop: 22 }}>
              {SCORES.map(([n, v], i) => {
                const p = prog(f, 360 + i * 10, 34, easeInOut);
                const col = v >= 7 ? C.danger : v >= 4 ? C.warning : C.border;
                return (
                  <div key={n} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, marginBottom: 7 }}>
                      <span style={{ fontWeight: 500 }}>{n}</span>
                      <span style={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: v ? C.text : C.faint }}>
                        {Math.round(v * p)}
                        <span style={{ color: C.faint, fontWeight: 500 }}>/10</span>
                      </span>
                    </div>
                    <ProgressBar p={(v / 10) * p} w="100%" color={col} h={7} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.dim, fontSize: 15, opacity: prog(f, 440, 20) }}>
              <svg width={16} height={16} viewBox="0 0 20 20">
                <path d="M8 12 L12 8 M7 9.5 L5 11.5 A3 3 0 0 0 9.5 16 L11.5 14 M13 10.5 L15 8.5 A3 3 0 0 0 10.5 4 L8.5 6" fill="none" stroke={C.accent} strokeWidth={1.6} strokeLinecap="round" />
              </svg>
              Every score carries its evidence and cited sources, and you can edit any of them.
            </div>
          </Panel>
        </div>
      </AppWindow>
    </Scene>
  );
};

/* ================================================================== */
/* 05 — DECIDE                                                        */
/* ================================================================== */
const REASON =
  'The term of endearment “Sugar Buns” is highly specific to English-speaking contexts, using food words to convey affection in a way that would not read as endearing in Japanese. A direct translation would lose the playful, affectionate tone, so transcreation is needed to carry the characters’ warmth.';

export const VerdictScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const reason = typed(REASON, f, 30, 62);
  const sugg = prog(f, 200, 20);
  const ja = prog(f, 250, 20, easeInOut);
  const menu = prog(f, 322, 8) * (1 - prog(f, 360, 8));
  const accepted = f >= 356;
  const L = 22;
  const selects = { verdictX: 440, y: 150 };
  return (
    <Scene>
      <StepHeader num="05" label="DECIDE" title="Reasons, not just flags. You decide." sub="Each flag arrives with evidence, a priority score and a suggested replacement to accept, edit or reject." end={dur} />
      <AppWindow exit={dur}>
        <WorkspaceTitle tab="PROJECT" projectFlag="JAPAN" />
        <Panel style={{ position: 'absolute', left: L, top: 112, width: 1000, height: 634, background: C.panel2 }}>
          <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
            <Button style={{ fontSize: 14, padding: '6px 12px' }}>← Back to table</Button>
            <span style={{ marginLeft: 'auto' }} />
            <Button style={{ fontSize: 14, padding: '6px 12px' }}>← Previous</Button>
            <Button style={{ fontSize: 14, padding: '6px 12px' }}>Next →</Button>
          </div>
          <div style={{ padding: '18px 24px', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1, fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>
                00:34–00:39 — Relax, Sugar Buns. While she does all the work we’ll have all the fun.
              </div>
              <div style={{ textAlign: 'center' }}>
                <Gauge value={3.8} size={92} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
              {[
                ['AI ASSESSMENT', 'Needs Change', C.danger],
                ['YOUR VERDICT', accepted ? 'accepted' : 'pending', accepted ? C.success : C.warning],
              ].map(([l, v, col], i) => (
                <div key={l} style={{ width: 380 }}>
                  <Eyebrow>{l}</Eyebrow>
                  <div
                    style={{
                      marginTop: 8,
                      height: 42,
                      borderRadius: 9,
                      border: `1px solid ${i === 1 && menu > 0 ? C.accent : C.border}`,
                      background: C.bg,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 14px',
                      color: col,
                      fontWeight: 700,
                      fontSize: 16,
                      boxShadow: i === 1 && accepted ? `0 0 ${20 * (1 - prog(f, 356, 40))}px ${C.success}` : undefined,
                    }}
                  >
                    {v}
                    <span style={{ marginLeft: 'auto', color: C.faint }}>▾</span>
                  </div>
                </div>
              ))}
            </div>
            <Eyebrow style={{ marginTop: 22 }}>Executive reason</Eyebrow>
            <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, fontSize: 16.5, lineHeight: 1.5, color: C.text, height: 126 }}>
              {reason}
              {reason.length < REASON.length && <span style={{ display: 'inline-block', width: 2, height: 18, background: C.accent, marginLeft: 2, verticalAlign: 'middle' }} />}
            </div>
            <Eyebrow style={{ marginTop: 20 }}>Suggested change</Eyebrow>
            <div
              style={{
                marginTop: 8,
                padding: '14px 16px',
                borderRadius: 10,
                background: `rgba(29,58,102,${0.9 * sugg})`,
                border: `1px solid ${sugg > 0 ? C.accent : C.border}`,
                fontSize: 24,
                fontWeight: 700,
                opacity: 0.3 + 0.7 * sugg,
                boxShadow: `0 0 ${30 * sugg * (1 - prog(f, 240, 60))}px ${C.accentGlow}`,
              }}
            >
              {sugg > 0 ? '落ち着いて、ハニー。' : ' '}
            </div>
            <div style={{ marginTop: 10, fontSize: 15.5, color: C.dim, lineHeight: 1.5, opacity: prog(f, 222, 20) }}>
              <b style={{ color: C.text }}>Why:</b> ハニー (hanī), borrowed from “honey”, is widely understood and used affectionately in Japanese, keeping the endearment without cultural ambiguity.
            </div>
          </div>
          {/* verdict dropdown */}
          <div
            style={{
              position: 'absolute',
              left: 24 + 380 + 24,
              top: 238,
              width: 380,
              borderRadius: 10,
              background: C.panel,
              border: `1px solid ${C.borderStrong}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              opacity: menu,
              transform: `translateY(${(1 - menu) * -8}px)`,
              zIndex: 5,
              overflow: 'hidden',
            }}
          >
            {[
              ['pending', C.warning],
              ['accepted', C.success],
              ['rejected', C.danger],
              ['need-research', '#8ab4ff'],
            ].map(([v, col]) => (
              <div key={v} style={{ padding: '11px 16px', fontSize: 16, fontWeight: 700, color: col, background: v === 'accepted' && f > 340 ? C.accentSoft : 'transparent' }}>
                {v}
              </div>
            ))}
          </div>
        </Panel>
        <Player
          w={634}
          h={634}
          style={{ position: 'absolute', left: 1036, top: 112 }}
          time={34 + f / 30 / 3}
          clips={[{ src: 'sugarbuns', from: 0, dur: 180 }, { src: 'sugarbuns', from: 180, dur: 180 }, { src: 'sugarbuns', from: 360, dur: 180 }]}
          subtitle={
            <div style={{ position: 'relative', height: 90 }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 1 - ja, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>Relax, Sugar Buns. While she does all the work we’ll have all the fun.</div>
              <div style={{ position: 'absolute', inset: 0, opacity: ja, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: 30 }}>落ち着いて、ハニー。</div>
            </div>
          }
        />
        <div style={{ position: 'absolute', left: 1056, top: 130, opacity: ja }}>
          <Badge tone="accent" style={{ background: 'rgba(3,4,5,0.75)', border: `1px solid ${C.accent}` }}>PREVIEW · 日本語</Badge>
        </div>
      </AppWindow>
      <Cursor
        show={[290, dur - 20]}
        keys={[
          { f: 290, x: 1300, y: 900 },
          { f: 318, ...at(L + selects.verdictX + 120, 112 + 190) },
          { f: 334, ...at(L + selects.verdictX + 120, 112 + 190) },
          { f: 352, ...at(L + selects.verdictX + 120, 112 + 190 + 84) },
        ]}
        clicks={[322, 356]}
      />
    </Scene>
  );
};

/* ================================================================== */
/* 06 — CONVERSE                                                      */
/* ================================================================== */
const ASK = 'Is ハニー too soft for these two? They tease each other a lot.';
const REPLY =
  'ハニー keeps the teasing, playful register, which fits a couple bickering on a camping trip. If you want more bite, ねぇ、ダーリン leans theatrical. I’ve nudged Slang / meme reference to 6. The replacement stays in your review queue.';

export const ChatScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const dragging = f >= 20 && f < 72;
  const chipIn = f >= 72;
  const composer = typed(ASK, f, 80, 34);
  const sent = f >= 150;
  const reply = typed(REPLY, f, 232, 70);
  const TW = 880;
  const rowY = 112 + 52 + 38 + 40 * 3 + 20;
  const composerY = 112 + 634 - 64;
  const chatX = 920;
  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 10px',
    borderRadius: 8,
    background: C.accentDim,
    border: `1px solid ${C.accent}`,
    color: '#cfe0ff',
    fontSize: 14,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    fontFamily: FONT,
  };
  const cursorKeys = [
    { f: 0, x: 900, y: 980 },
    { f: 18, ...at(300, rowY) },
    { f: 24, ...at(300, rowY) },
    { f: 68, ...at(chatX + 60, composerY + 30) },
    { f: 90, ...at(chatX + 60, composerY + 30) },
  ];
  const cx = interpolate(f, cursorKeys.map((k) => k.f), cursorKeys.map((k) => k.x), { ...CLAMP, easing: easeInOut });
  const cy = interpolate(f, cursorKeys.map((k) => k.f), cursorKeys.map((k) => k.y), { ...CLAMP, easing: easeInOut });
  return (
    <Scene>
      <StepHeader num="06" label="CONVERSE" title="Question any score. Push back." sub="Every agent is also a chat partner. Drag a row in as a reference; nothing bypasses review unless you say so." end={dur} />
      <AppWindow exit={dur}>
        <WorkspaceTitle tab="PROJECT" projectFlag="JAPAN" />
        <Panel style={{ position: 'absolute', left: 22, top: 112, width: TW, height: 634 }}>
          <div style={{ padding: '14px 18px', height: 52, boxSizing: 'border-box', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700 }}>
            <Flag code="JP" w={28} /> Project: Japan
          </div>
          <div style={{ display: 'flex', padding: '0 18px', height: 38, alignItems: 'center', color: C.faint, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 80 }}>START</span>
            <span style={{ width: 110 }}>IMPORTANCE</span>
            <span style={{ flex: 1 }}>SUBTITLE</span>
            <span style={{ width: 120 }}>VERDICT</span>
          </div>
          {SORTED.slice(0, 11).map((idx, i) => {
            const it = ITEMS[idx];
            const hl = idx === 1;
            return (
              <div key={idx} style={{ display: 'flex', padding: '0 18px', height: 40, alignItems: 'center', fontSize: 16, borderBottom: `1px solid ${C.border}`, background: hl && f >= 18 ? C.accentSoft : 'transparent', boxShadow: hl ? `inset 3px 0 0 ${C.accent}` : undefined }}>
                <span style={{ width: 80, color: C.dim }}>{mmss(it.s)}</span>
                <span style={{ width: 110, fontWeight: 700 }}>{it.imp.toFixed(1)}</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 12 }}>{it.sub}</span>
                <span style={{ width: 120 }}>
                  <Badge tone={idx === 1 ? 'success' : i < 3 ? 'success' : 'warning'}>{idx === 1 || i < 3 ? 'accepted' : 'pending'}</Badge>
                </span>
              </div>
            );
          })}
        </Panel>
        <Panel style={{ position: 'absolute', left: chatX, top: 112, width: 750, height: 634, background: C.panel }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Research Agent</span>
            <Badge>Session</Badge>
            <span style={{ marginLeft: 'auto', color: C.dim, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flag code="JP" w={22} /> knows your target market
            </span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sent && (
              <div style={{ alignSelf: 'flex-end', maxWidth: 560, padding: '12px 16px', borderRadius: '14px 14px 4px 14px', background: C.accent, fontSize: 16.5, lineHeight: 1.45, opacity: prog(f, 150, 10) }}>
                <span style={{ ...chipStyle, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', marginBottom: 8 }}>@ 00:34 Relax, Sugar Buns…</span>
                <div>{ASK}</div>
              </div>
            )}
            {f >= 160 && f < 186 && (
              <div style={{ display: 'flex', gap: 6, padding: 10 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: C.dim, opacity: 0.3 + 0.7 * Math.abs(Math.sin((f + i * 5) / 6)) }} />
                ))}
              </div>
            )}
            {[
              [186, 'search_web', '“ハニー” vs “ダーリン” as couple nicknames in Japanese media', '5 results'],
              [208, 'update_rubric_score', 'Slang / meme reference · 7 → 6', 'queued for review'],
            ].map(([a, tool, what, meta]) =>
              f >= (a as number) ? (
                <div key={tool as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 15, opacity: prog(f, a as number, 12) }}>
                  <Check size={16} />
                  <code style={{ color: '#8ab4ff', fontWeight: 700, fontFamily: 'Consolas, monospace' }}>{tool}</code>
                  <span style={{ color: C.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{what}</span>
                  <span style={{ color: C.faint }}>{meta}</span>
                </div>
              ) : null,
            )}
            {f >= 232 && (
              <div style={{ maxWidth: 640, padding: '14px 16px', borderRadius: '14px 14px 14px 4px', background: C.bg, border: `1px solid ${C.border}`, fontSize: 16.5, lineHeight: 1.55 }}>
                {reply}
              </div>
            )}
            {f >= 300 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: prog(f, 300, 14) }}>
                <Button style={{ fontSize: 14, padding: '8px 14px', borderColor: C.gold, color: C.gold }}>✦ Find Trend-Sourced Alternative</Button>
                <span style={{ color: C.faint, fontSize: 14 }}>Trend Agent · live citations · freshness check</span>
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, height: 52, borderRadius: 12, border: `1px solid ${dragging && f > 50 ? C.accent : C.borderStrong}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 16, boxShadow: dragging && f > 50 ? `0 0 0 3px ${C.accentSoft}` : undefined }}>
            {chipIn && !sent && <span style={chipStyle}>@ 00:34 Relax, Sugar Buns…</span>}
            <span style={{ color: composer && !sent ? C.text : C.faint, whiteSpace: 'nowrap', overflow: 'hidden' }}>{!sent && composer ? composer : 'Ask, or type @ to reference a row'}</span>
            <span style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: 8, background: C.accent, display: 'grid', placeItems: 'center', transform: `scale(${f >= 146 && f < 152 ? 0.9 : 1})` }}>
              <svg width={16} height={16} viewBox="0 0 20 20"><path d="M4 10 H16 M11 5 L16 10 L11 15" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" /></svg>
            </span>
          </div>
        </Panel>
      </AppWindow>
      {dragging && (
        <div style={{ position: 'absolute', left: cx + 18, top: cy + 14, ...chipStyle, boxShadow: '0 12px 30px rgba(0,0,0,0.6)', transform: 'rotate(-2deg)', zIndex: 45 }}>@ 00:34 Relax, Sugar Buns…</div>
      )}
      <Cursor show={[4, 96]} keys={cursorKeys} clicks={[22]} />
    </Scene>
  );
};
