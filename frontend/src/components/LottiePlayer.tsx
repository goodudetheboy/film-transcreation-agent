import { useEffect, useRef } from 'react';
import type { AnimationItem } from 'lottie-web';

export interface LottiePlayerProps {
  animationData: object;
  loop?: boolean;
  className?: string;
}

/** Loads `lottie-web` on demand rather than as a static import — the library
 * probes for canvas support at module-load time, which crashes under jsdom
 * (and would otherwise pull the player into every bundle that imports
 * PrepAnimation, not just the pages that render a Lottie-based scene). */
export function LottiePlayer({ animationData, loop = false, className }: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let anim: AnimationItem | undefined;
    let cancelled = false;

    import('lottie-web')
      .then(({ default: lottie }) => {
        if (cancelled || !containerRef.current) return;
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay: true,
          animationData,
        });
      })
      // Swallow load/init failures (e.g. no canvas support in a test
      // environment) rather than surfacing an unhandled rejection — a
      // missing animation isn't fatal to the page around it.
      .catch(() => {});

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [animationData, loop]);

  return <div ref={containerRef} className={className} />;
}
