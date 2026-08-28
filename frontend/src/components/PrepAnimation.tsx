import type { FilmPrepStage } from '../api/apiClient.types';

export interface PrepAnimationProps {
  stage: FilmPrepStage;
}

/** A cloud with a beam icon rising into it — used for both upload stages. */
function UploadScene({ icon }: { icon: 'video' | 'script' }) {
  return (
    <div className="prep-scene">
      <svg viewBox="0 0 220 180" className="prep-scene__svg">
        <g className="prep-cloud">
          <ellipse cx="110" cy="55" rx="52" ry="26" />
          <ellipse cx="76" cy="62" rx="30" ry="20" />
          <ellipse cx="146" cy="62" rx="30" ry="20" />
        </g>
        <g className="prep-beam">
          <line x1="110" y1="150" x2="110" y2="95" />
          <path d="M 100 108 L 110 95 L 120 108" fill="none" />
        </g>
        <g className="prep-upload-icon">
          {icon === 'video' ? (
            <g>
              <rect x="78" y="128" width="48" height="34" rx="4" />
              <path d="M 126 138 L 146 130 L 146 160 L 126 152 Z" />
            </g>
          ) : (
            <g>
              <rect x="86" y="122" width="42" height="52" rx="3" />
              <line x1="94" y1="136" x2="120" y2="136" />
              <line x1="94" y1="146" x2="120" y2="146" />
              <line x1="94" y1="156" x2="112" y2="156" />
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
      <svg viewBox="0 0 220 180" className="prep-scene__svg">
        <g className="prep-video-icon">
          <rect x="60" y="60" width="76" height="54" rx="5" />
          <path d="M 136 74 L 162 62 L 162 112 L 136 100 Z" />
        </g>
        <g className="prep-magnifier">
          <circle cx="0" cy="0" r="22" />
          <line x1="16" y1="16" x2="34" y2="34" />
        </g>
        <g className="prep-sparkle">
          <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" />
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
      <svg viewBox="0 0 220 180" className="prep-scene__svg">
        <g className="prep-pack-video">
          <rect x="30" y="40" width="44" height="32" rx="4" />
          <path d="M 74 48 L 92 42 L 92 70 L 74 64 Z" />
        </g>
        <g className="prep-pack-script">
          <rect x="150" y="40" width="32" height="40" rx="3" />
          <line x1="156" y1="52" x2="176" y2="52" />
          <line x1="156" y1="60" x2="176" y2="60" />
        </g>
        <g className="prep-gift-box">
          <rect x="72" y="108" width="76" height="52" rx="4" className="prep-gift-box__body" />
          <rect x="72" y="98" width="76" height="16" rx="3" className="prep-gift-box__lid" />
          <line x1="110" y1="98" x2="110" y2="160" className="prep-gift-box__ribbon" />
          <path d="M 100 98 Q 92 82 110 82 Q 128 82 120 98" className="prep-gift-box__bow" fill="none" />
        </g>
      </svg>
    </div>
  );
}

function ReadyScene() {
  return (
    <div className="prep-scene prep-scene--ready">
      <svg viewBox="0 0 220 180" className="prep-scene__svg">
        <g className="prep-gift-lid-fly">
          <rect x="72" y="82" width="76" height="16" rx="3" />
        </g>
        <g className="prep-gift-box-open">
          <rect x="72" y="108" width="76" height="52" rx="4" />
          <line x1="110" y1="108" x2="110" y2="160" />
        </g>
        <g className="prep-burst">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line key={deg} x1="110" y1="118" x2="110" y2="90" transform={`rotate(${deg} 110 118)`} />
          ))}
        </g>
        <g className="prep-check">
          <path d="M 92 118 L 105 132 L 130 100" fill="none" />
        </g>
      </svg>
    </div>
  );
}

/**
 * The wireframe called for a real animated illustration per prep stage, not a
 * plain checklist: video/script icons beaming up into a cloud, a sparkly
 * magnifying glass sweeping the video while discovery runs (with a progress
 * bar), the film being "packed" into a gift box while finalizing, and the
 * gift box opening once the film is ready. FilmPreparingView pairs this with
 * a slim step-dot indicator for the at-a-glance status the checklist used to
 * carry.
 */
export function PrepAnimation({ stage }: PrepAnimationProps) {
  if (stage === 'video_uploading') return <UploadScene icon="video" />;
  if (stage === 'subtitle_uploading') return <UploadScene icon="script" />;
  if (stage === 'discovery_running') return <DiscoveryScene />;
  if (stage === 'finalizing') return <PackingScene />;
  if (stage === 'ready') return <ReadyScene />;
  return <PackingScene />;
}
