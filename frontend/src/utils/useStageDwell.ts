import { useEffect, useRef, useState } from 'react';
import type { FilmPrepStage } from '../api/apiClient.types';

/** The animated stage before any real backend event has arrived yet — the
 * sketch's "Your film is being prepared" beat that kicks off the sequence. */
export type DisplayPrepStage = FilmPrepStage | 'preparing';

/** Minimum time each prep-flow animation stays on screen, shared with the
 * upload-stage animations in `ImportFilmPage.tsx` so "at least Ns" is one
 * constant across the whole flow. */
export const MIN_STAGE_DWELL_MS = 3000;

/** User-facing copy for each display stage — shared between `FilmPreparingView`
 * and the dev-only `PrepAnimationLab`. */
export const STAGE_LABELS: Record<DisplayPrepStage, string> = {
  preparing: 'Your film is being prepared…',
  video_uploading: 'Uploading your video…',
  subtitle_uploading: 'Uploading your script…',
  discovery_running: 'Searching the video for details…',
  finalizing: 'Wrapping up the last few details…',
  ready: 'Your film is up and ready!',
  error: 'Something went wrong.',
};

/**
 * Decouples the *displayed* prep stage from the raw SSE-driven one so bursts
 * of fast backend events (the whole pipeline can resolve almost instantly in
 * test mode) don't skip past their animations. Starts on 'preparing' and
 * holds every stage — including that first one — on screen for at least
 * `minDwellMs` before advancing to the next queued one. 'error' always jumps
 * the queue and displays immediately — no reason to sit through a stale
 * success animation before showing a failure.
 */
class StageDwellController {
  private queue: FilmPrepStage[] = [];
  private lastSeen: FilmPrepStage | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly minDwellMs: number;
  private readonly onChange: (stage: DisplayPrepStage) => void;

  constructor(minDwellMs: number, onChange: (stage: DisplayPrepStage) => void) {
    this.minDwellMs = minDwellMs;
    this.onChange = onChange;
    this.armTimer();
  }

  private armTimer() {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, this.minDwellMs);
  }

  private pump() {
    if (this.timer || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.onChange(next);
    this.armTimer();
  }

  setRawStage(rawStage: FilmPrepStage | null) {
    if (rawStage === null) {
      this.queue = [];
      this.lastSeen = null;
      if (this.timer) clearTimeout(this.timer);
      this.onChange('preparing');
      this.armTimer();
      return;
    }

    if (rawStage === this.lastSeen) return;
    this.lastSeen = rawStage;

    if (rawStage === 'error') {
      this.queue = [];
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.onChange('error');
      return;
    }

    this.queue.push(rawStage);
    this.pump();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export function useStageDwell(rawStage: FilmPrepStage | null, minDwellMs = MIN_STAGE_DWELL_MS): DisplayPrepStage {
  const [displayStage, setDisplayStage] = useState<DisplayPrepStage>('preparing');
  const controllerRef = useRef<StageDwellController | null>(null);
  const onChangeRef = useRef(setDisplayStage);
  onChangeRef.current = setDisplayStage;

  useEffect(() => {
    const controller = new StageDwellController(minDwellMs, (stage) => onChangeRef.current(stage));
    controllerRef.current = controller;
    setDisplayStage('preparing');
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [minDwellMs]);

  useEffect(() => {
    controllerRef.current?.setRawStage(rawStage);
  }, [rawStage]);

  return displayStage;
}
