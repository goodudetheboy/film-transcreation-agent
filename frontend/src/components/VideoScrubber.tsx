import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DetailRow, SubtitleEntry } from '../api/apiClient.types';
import { formatClock } from '../utils/timeFormat';

/** Mirrors ProjectItemAction (apiClient.types.ts) without importing the Project
 * domain into this general-purpose video component. 'need-research' (or no entry
 * at all, when this track isn't showing Project data) renders as the default
 * untinted block — it means "no agent has looked at this yet," not a status worth
 * flagging in the timeline. */
export type DetailRowStatus = 'pending' | 'accepted' | 'rejected' | 'need-research';

export interface VideoScrubberProps {
  entries: SubtitleEntry[];
  detailRows: DetailRow[];
  durationMs: number;
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  /** Project-item status (accepted/rejected/pending/need-research) keyed by
   * DetailRow id, so the Details track can color each block by review status
   * instead of a separate overlay. Omitted rows (or when not viewing a project)
   * render with the default untinted styling. */
  rowStatus?: Record<string, DetailRowStatus>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 60;
const WHEEL_ZOOM_FACTOR = 1.15;
const MIN_TICK_LABEL_SPACING_PX = 70;
// Candidates for the ruler's tick interval, ascending — the smallest one whose
// on-screen label spacing clears MIN_TICK_LABEL_SPACING_PX wins, so labels
// never overlap regardless of zoom level or clip length.
const TICK_STEPS_MS = [
  100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000,
];

function pickTickStepMs(durationMs: number, trackWidthPx: number): number {
  if (durationMs <= 0 || trackWidthPx <= 0) return TICK_STEPS_MS[0];
  for (const step of TICK_STEPS_MS) {
    if ((step / durationMs) * trackWidthPx >= MIN_TICK_LABEL_SPACING_PX) return step;
  }
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** Sub-second tick steps need sub-second precision in their own labels
 * ("00:01.250") — formatClock() elsewhere in the app intentionally only ever
 * shows whole seconds, since nothing else needs finer granularity than that. */
function formatTickLabel(ms: number, stepMs: number): string {
  if (stepMs >= 1000) return formatClock(ms);
  return `${formatClock(ms)}.${String(Math.round(ms % 1000)).padStart(3, '0')}`;
}

function detailRowLabel(row: DetailRow): string {
  return row.subtitleText || row.values.segmentDescription || row.values.gesture || row.values.notes || '(untitled)';
}

/** A zoomable, scrollable, two-track timeline: scroll to zoom (centered on the
 * cursor), drag the native scrollbar (or shift+scroll) to pan once zoomed in.
 * A time ruler, the film's raw subtitle-entry track, and the curated
 * Details-row track all live on one wide "track" whose percentage-based
 * positions automatically scale with zoom — only the track's pixel width and
 * the viewport's scroll position change. */
export function VideoScrubber({ entries, detailRows, durationMs, currentTimeMs, onSeek, rowStatus }: VideoScrubberProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  // Refs mirror the zoom/viewportWidth state so the wheel handler below always
  // reads the just-computed value, not a stale render closure — without this,
  // a burst of wheel events firing faster than React re-renders (routine on a
  // trackpad) would all compute from the same stale base and only the last one
  // would stick, instead of compounding smoothly like a real zoom gesture.
  const zoomRef = useRef(1);
  const viewportWidthRef = useRef(0);
  const [zoom, setZoomState] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);

  function commitZoom(next: number) {
    zoomRef.current = next;
    setZoomState(next);
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function updateWidth(width: number) {
      viewportWidthRef.current = width;
      setViewportWidth(width);
    }
    updateWidth(viewport.getBoundingClientRect().width);
    const observer = new ResizeObserver((observerEntries) => {
      const width = observerEntries[0]?.contentRect.width;
      if (width != null) updateWidth(width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Applying scrollLeft here (post-DOM-update, pre-paint) instead of right in
  // the wheel handler avoids the classic "set scrollLeft before the width
  // change actually lands" ordering bug — the browser would silently clamp it
  // to the *old* (narrower) scrollable range first.
  useLayoutEffect(() => {
    if (pendingScrollLeftRef.current == null) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function handleWheel(e: WheelEvent) {
      const currentViewportWidth = viewportWidthRef.current;
      if (durationMs <= 0 || currentViewportWidth <= 0) return;
      e.preventDefault();
      const rect = viewport!.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const currentZoom = zoomRef.current;
      const trackWidth = currentViewportWidth * currentZoom;
      const msUnderCursor = ((viewport!.scrollLeft + cursorX) / trackWidth) * durationMs;

      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor));
      if (nextZoom === currentZoom) return;

      const nextTrackWidth = currentViewportWidth * nextZoom;
      const nextScrollLeft = (msUnderCursor / durationMs) * nextTrackWidth - cursorX;
      pendingScrollLeftRef.current = Math.max(0, Math.min(nextTrackWidth - currentViewportWidth, nextScrollLeft));
      commitZoom(nextZoom);
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [durationMs]);

  function seekFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track || durationMs <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * durationMs);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    seekFromClientX(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    seekFromClientX(e.clientX);
  }

  function zoomBy(factor: number) {
    commitZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor)));
  }

  function resetZoom() {
    pendingScrollLeftRef.current = 0;
    commitZoom(1);
  }

  const progressPct = durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;
  const trackWidthPx = viewportWidth * zoom;
  const tickStep = pickTickStepMs(durationMs, trackWidthPx);
  const ticks: number[] = [];
  if (durationMs > 0) {
    for (let t = 0; t <= durationMs; t += tickStep) ticks.push(t);
  }

  return (
    <div className="scrubber-wrap">
      <div className="scrubber-labels">
        <div className="scrubber-labels__ruler-spacer" />
        <div className="scrubber-labels__row">Subtitles</div>
        <div className="scrubber-labels__row">Details</div>
      </div>
      <div className="scrubber-viewport" ref={viewportRef}>
        <div
          ref={trackRef}
          className="scrubber-track"
          style={{ width: `${zoom * 100}%` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          role="slider"
          aria-label="Video position"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={currentTimeMs}
        >
          <div className="scrubber-ruler">
            {ticks.map((t) => (
              <div key={t} className="scrubber-tick" style={{ left: `${(t / durationMs) * 100}%` }}>
                <span className="scrubber-tick__label">{formatTickLabel(t, tickStep)}</span>
              </div>
            ))}
          </div>
          <div className="scrubber-content scrubber-content--subtitles">
            <div className="scrubber__fill" style={{ width: `${progressPct}%` }} />
            {durationMs > 0 &&
              entries.map((entry) => {
                // Subtitle files aren't guaranteed to fit inside the video's actual
                // duration (e.g. a script authored/edited separately) — clamp to
                // [0, 100]% so a stray out-of-range entry can't blow out this
                // absolutely-positioned block past the track.
                if (entry.startMs >= durationMs) return null;
                const isActive = currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs;
                const leftPct = Math.max(0, (entry.startMs / durationMs) * 100);
                const rawWidthPct = ((entry.endMs - entry.startMs) / durationMs) * 100;
                const widthPct = Math.max(0, Math.min(100 - leftPct, rawWidthPct));
                return (
                  <div
                    key={entry.id}
                    className={`scrubber__block${isActive ? ' scrubber__block--active' : ''}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={entry.text}
                  >
                    <span className="scrubber__block-label">{entry.text}</span>
                  </div>
                );
              })}
          </div>
          <div className="scrubber-content scrubber-content--details">
            {durationMs > 0 &&
              detailRows.map((row) => {
                if (row.startMs >= durationMs) return null;
                const isActive = currentTimeMs >= row.startMs && currentTimeMs < row.endMs;
                const leftPct = Math.max(0, (row.startMs / durationMs) * 100);
                const rawWidthPct = ((row.endMs - row.startMs) / durationMs) * 100;
                const widthPct = Math.max(0, Math.min(100 - leftPct, rawWidthPct));
                const label = detailRowLabel(row);
                const status = rowStatus?.[row.id];
                const statusClass = status && status !== 'need-research' ? ` scrubber__block--status-${status}` : '';
                return (
                  <div
                    key={row.id}
                    className={`scrubber__block scrubber__block--detail${statusClass}${isActive ? ' scrubber__block--active' : ''}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={label}
                  >
                    <span className="scrubber__block-label">{label}</span>
                  </div>
                );
              })}
          </div>
          <div className="scrubber-handle" style={{ left: `${progressPct}%` }} />
        </div>
      </div>
      <div className="scrubber-zoom">
        <button type="button" className="scrubber-zoom__btn" title="Zoom out" onClick={() => zoomBy(1 / 1.5)} disabled={zoom <= MIN_ZOOM}>
          −
        </button>
        <span className="scrubber-zoom__level">{Math.round(zoom * 100)}%</span>
        <button type="button" className="scrubber-zoom__btn" title="Zoom in" onClick={() => zoomBy(1.5)} disabled={zoom >= MAX_ZOOM}>
          ＋
        </button>
        <button type="button" className="scrubber-zoom__btn scrubber-zoom__btn--fit" title="Fit to window" onClick={resetZoom} disabled={zoom === 1}>
          Fit
        </button>
      </div>
    </div>
  );
}
