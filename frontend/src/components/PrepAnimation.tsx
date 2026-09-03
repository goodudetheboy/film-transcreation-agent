import type { DisplayPrepStage } from '../utils/useStageDwell';

export interface PrepAnimationProps {
  stage: DisplayPrepStage;
}

const PARTICLE_DELAYS = [0, 0.5, 1, 1.5];
const BURST_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const BURST_COLORS = ['prep-burst-a', 'prep-burst-b', 'prep-burst-c'];

/** A soft pulsing glow disc dropped behind the main icon of every scene. */
function Glow() {
  return <ellipse className="prep-glow" cx="130" cy="115" rx="70" ry="60" />;
}

/** Stage 1 — the very first beat, before any upload has actually started. */
function PreparingScene() {
  return (
    <div className="prep-scene">
      <svg viewBox="0 0 260 230" className="prep-scene__svg">
        <Glow />
        <circle className="prep-spinner-ring" cx="130" cy="115" r="46" />
        <g className="prep-clapper">
          <rect x="98" y="118" width="64" height="42" rx="5" />
          <path d="M 98 118 L 108 100 L 168 100 L 158 118 Z" className="prep-clapper__top" />
          <line x1="112" y1="100" x2="122" y2="118" />
          <line x1="132" y1="100" x2="142" y2="118" />
          <line x1="152" y1="100" x2="150" y2="118" />
        </g>
      </svg>
    </div>
  );
}

/** A cloud with icons beaming up into it — used for both upload stages. */
function UploadScene({ icon }: { icon: 'video' | 'script' }) {
  return (
    <div className="prep-scene">
      <svg viewBox="0 0 260 230" className="prep-scene__svg">
        <Glow />
        <g className="prep-cloud">
          <ellipse cx="130" cy="80" rx="58" ry="29" />
          <ellipse cx="92" cy="88" rx="34" ry="22" />
          <ellipse cx="168" cy="88" rx="34" ry="22" />
        </g>
        <g className="prep-particles">
          {PARTICLE_DELAYS.map((delay) => (
            <circle key={delay} className="prep-particle" cx="130" cy="185" r="4" style={{ animationDelay: `${delay}s` }} />
          ))}
        </g>
        <g className="prep-beam">
          <line x1="130" y1="185" x2="130" y2="118" />
          <path d="M 118 132 L 130 118 L 142 132" fill="none" />
        </g>
        <g className="prep-upload-icon">
          {icon === 'video' ? (
            <g>
              <rect x="92" y="150" width="56" height="40" rx="5" />
              <path d="M 148 162 L 172 152 L 172 188 L 148 178 Z" />
            </g>
          ) : (
            <g>
              <rect x="102" y="144" width="48" height="60" rx="4" />
              <line x1="112" y1="160" x2="140" y2="160" />
              <line x1="112" y1="172" x2="140" y2="172" />
              <line x1="112" y1="184" x2="130" y2="184" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

function DiscoveryScene() {
  return (
    <div className="prep-scene">
      <svg viewBox="0 0 260 230" className="prep-scene__svg">
        <Glow />
        <g className="prep-ping-rings">
          <circle className="prep-ping" cx="120" cy="105" r="10" style={{ animationDelay: '0s' }} />
          <circle className="prep-ping" cx="120" cy="105" r="10" style={{ animationDelay: '0.7s' }} />
          <circle className="prep-ping" cx="120" cy="105" r="10" style={{ animationDelay: '1.4s' }} />
        </g>
        <g className="prep-video-icon">
          <rect x="72" y="76" width="96" height="66" rx="6" />
          <path d="M 168 92 L 198 78 L 198 136 L 168 122 Z" />
        </g>
        <g className="prep-magnifier">
          <circle cx="0" cy="0" r="28" />
          <line x1="20" y1="20" x2="42" y2="42" />
          <line className="prep-magnifier__shine" x1="-12" y1="-16" x2="4" y2="-24" />
        </g>
        <g className="prep-sparkle">
          <path d="M0 -10 L2.5 -2.5 L10 0 L2.5 2.5 L0 10 L-2.5 2.5 L-10 0 L-2.5 -2.5 Z" />
        </g>
        <g className="prep-sparkle prep-sparkle--small">
          <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" />
        </g>
      </svg>
      <div className="prep-progress-bar">
        <div className="prep-progress-bar__sweep" />
      </div>
    </div>
  );
}

function PackingScene() {
  return (
    <div className="prep-scene">
      <svg viewBox="0 0 260 230" className="prep-scene__svg">
        <Glow />
        <g className="prep-pack-video">
          <rect x="38" y="46" width="52" height="38" rx="5" />
          <path d="M 90 55 L 110 47 L 110 83 L 90 75 Z" />
        </g>
        <g className="prep-pack-script">
          <rect x="176" y="46" width="38" height="46" rx="4" />
          <line x1="184" y1="60" x2="206" y2="60" />
          <line x1="184" y1="70" x2="206" y2="70" />
        </g>
        <ellipse className="prep-gift-glow-ring" cx="130" cy="159" rx="52" ry="37" />
        <g className="prep-gift-box">
          <rect x="84" y="128" width="92" height="62" rx="5" className="prep-gift-box__body" />
          <rect x="84" y="116" width="92" height="18" rx="3" className="prep-gift-box__lid" />
          <line x1="130" y1="116" x2="130" y2="190" className="prep-gift-box__ribbon" />
          <path d="M 118 116 Q 108 96 130 96 Q 152 96 142 116" className="prep-gift-box__bow" fill="none" />
        </g>
      </svg>
    </div>
  );
}

function ReadyScene() {
  return (
    <div className="prep-scene prep-scene--ready">
      <svg viewBox="0 0 260 230" className="prep-scene__svg">
        <g className="prep-burst">
          {BURST_ANGLES.map((deg, i) => (
            <line
              key={deg}
              className={BURST_COLORS[i % BURST_COLORS.length]}
              x1="130"
              y1="140"
              x2="130"
              y2="104"
              transform={`rotate(${deg} 130 140)`}
              style={{ animationDelay: `${(i % 4) * 60}ms` }}
            />
          ))}
        </g>
        <circle className="prep-pop-ring" cx="130" cy="150" r="30" />
        <g className="prep-gift-lid-fly">
          <rect x="84" y="96" width="92" height="18" rx="3" />
        </g>
        <g className="prep-gift-box-open">
          <rect x="84" y="128" width="92" height="62" rx="5" />
          <line x1="130" y1="128" x2="130" y2="190" />
        </g>
        <g className="prep-check">
          <path d="M 108 150 L 124 168 L 156 128" fill="none" />
        </g>
      </svg>
    </div>
  );
}

/**
 * The wireframe called for a real animated illustration per prep stage, not a
 * plain checklist: an idle "getting ready" beat, video/script icons beaming
 * up into a cloud, a sparkly magnifying glass sweeping the video while
 * discovery runs (with a progress bar and radar pings), the film being
 * "packed" into a gift box while finalizing, and the gift box bursting open
 * once the film is ready. FilmPreparingView pairs this with a slim step-dot
 * indicator for the at-a-glance status the checklist used to carry.
 */
export function PrepAnimation({ stage }: PrepAnimationProps) {
  if (stage === 'preparing') return <PreparingScene />;
  if (stage === 'video_uploading') return <UploadScene icon="video" />;
  if (stage === 'subtitle_uploading') return <UploadScene icon="script" />;
  if (stage === 'discovery_running') return <DiscoveryScene />;
  if (stage === 'finalizing') return <PackingScene />;
  if (stage === 'ready') return <ReadyScene />;
  return <PackingScene />;
}
