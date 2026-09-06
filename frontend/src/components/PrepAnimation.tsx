import type { DisplayPrepStage } from '../utils/useStageDwell';
import { LottiePlayer } from './LottiePlayer';
import preparingAnimation from '../assets/animations/prep-preparing.json';
import videoUploadingAnimation from '../assets/animations/prep-video-uploading.json';
import subtitleUploadingAnimation from '../assets/animations/prep-subtitle-uploading.json';
import discoveryRunningAnimation from '../assets/animations/prep-discovery-running.json';
import finalizingAnimation from '../assets/animations/prep-finalizing.json';
import readyAnimation from '../assets/animations/prep-ready.json';

export interface PrepAnimationProps {
  stage: DisplayPrepStage;
}

/** Stage 1 — the very first beat, before any upload has actually started. */
function PreparingScene() {
  return (
    <div className="prep-scene prep-scene--preparing">
      <LottiePlayer animationData={preparingAnimation} loop className="prep-scene__lottie" />
    </div>
  );
}

/** A cloud with icons beaming up into it — used for both upload stages. */
function UploadScene({ icon }: { icon: 'video' | 'script' }) {
  return (
    <div className={`prep-scene prep-scene--${icon === 'video' ? 'video-uploading' : 'subtitle-uploading'}`}>
      <LottiePlayer
        animationData={icon === 'video' ? videoUploadingAnimation : subtitleUploadingAnimation}
        loop
        className="prep-scene__lottie"
      />
    </div>
  );
}

function DiscoveryScene() {
  return (
    <div className="prep-scene prep-scene--discovery">
      <LottiePlayer animationData={discoveryRunningAnimation} loop className="prep-scene__lottie" />
    </div>
  );
}

function PackingScene() {
  return (
    <div className="prep-scene prep-scene--finalizing">
      <LottiePlayer animationData={finalizingAnimation} loop className="prep-scene__lottie" />
    </div>
  );
}

function ReadyScene() {
  return (
    <div className="prep-scene prep-scene--ready">
      <LottiePlayer animationData={readyAnimation} className="prep-scene__lottie" />
    </div>
  );
}

/**
 * One Lottie scene per prep stage: an idle "getting ready" beat, video/script
 * icons beaming up into a cloud, a sparkly magnifying glass sweeping the
 * video while discovery runs, the film being "packed" into a gift box while
 * finalizing, and the gift box bursting open once the film is ready.
 * FilmPreparingView pairs this with a slim step-dot indicator for the
 * at-a-glance status.
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
