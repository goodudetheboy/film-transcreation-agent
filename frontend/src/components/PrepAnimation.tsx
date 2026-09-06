import type { DisplayPrepStage } from '../utils/useStageDwell';
import { LottiePlayer } from './LottiePlayer';
import preparingAnimation from '../assets/animations/prep-preparing.json';
import videoUploadingAnimation from '../assets/animations/prep-video-uploading.json';
import discoveryRunningAnimation from '../assets/animations/prep-discovery-running.json';
import finalizingAnimation from '../assets/animations/prep-finalizing.json';
import readyAnimation from '../assets/animations/prep-ready.json';
import errorAnimation from '../assets/animations/prep-error.json';

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

/** Shared scene for both upload stages (video and subtitle) — a single
 * uploading animation covers both since the visual beat is the same. */
function UploadScene() {
  return (
    <div className="prep-scene prep-scene--uploading">
      <LottiePlayer animationData={videoUploadingAnimation} loop className="prep-scene__lottie" />
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

/** The animation's native loop is 6s (180 frames @ 30fps) — sped up to fit
 * a 5s loop instead. */
function PackingScene() {
  return (
    <div className="prep-scene prep-scene--finalizing">
      <LottiePlayer animationData={finalizingAnimation} loop speed={6 / 5} className="prep-scene__lottie" />
    </div>
  );
}

function ReadyScene() {
  return (
    <div className="prep-scene prep-scene--ready">
      <LottiePlayer animationData={readyAnimation} loop className="prep-scene__lottie" />
    </div>
  );
}

function ErrorScene() {
  return (
    <div className="prep-scene prep-scene--error">
      <LottiePlayer animationData={errorAnimation} className="prep-scene__lottie" />
    </div>
  );
}

/**
 * One Lottie scene per prep stage: an idle "getting ready" beat, a shared
 * uploading animation for both the video and subtitle stages, a discovery
 * scene while the video is analyzed, a finalizing scene, a ready scene, and
 * an error scene for a failed run. FilmPreparingView pairs this with a slim
 * step-dot indicator for the at-a-glance status.
 */
export function PrepAnimation({ stage }: PrepAnimationProps) {
  if (stage === 'preparing') return <PreparingScene />;
  if (stage === 'video_uploading' || stage === 'subtitle_uploading') return <UploadScene />;
  if (stage === 'discovery_running') return <DiscoveryScene />;
  if (stage === 'finalizing') return <PackingScene />;
  if (stage === 'ready') return <ReadyScene />;
  if (stage === 'error') return <ErrorScene />;
  return <PackingScene />;
}
