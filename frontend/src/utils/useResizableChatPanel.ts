import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** Shared by FilmWorkspaceView.tsx's Discovery chat panel and
 * ProjectPanel.tsx's Research chat panel — one width remembered for
 * whichever docked "Agent" chat panel the user resized last. */
export const CHAT_PANEL_WIDTH_STORAGE_KEY = 'workspace.chatPanelWidth';

export interface ResizableChatPanelResult {
  width: number;
  isDragging: boolean;
  /** Attach to the panel wrapper (`.workspace-details__chat`/
   * `.project-panel__chat`) — dragging mutates its `flexBasis` directly
   * instead of through React state, see onPointerMove's comment. */
  panelRef: RefObject<HTMLDivElement | null>;
  dividerProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

function readStored(storageKey: string, fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, Math.max(min, parsed)) : fallback;
  } catch {
    return fallback;
  }
}

/** Drag-to-resize width for a docked side chat panel (Discovery in
 * FilmWorkspaceView.tsx, Research in ProjectPanel.tsx) — same delta-drag +
 * localStorage-persist shape as FilmWorkspaceView.tsx's own scrubber-height
 * divider, adapted for a horizontal handle sitting to the panel's left (so
 * dragging left grows it, dragging right shrinks it). Both call sites share
 * one `storageKey` so resizing either "Agent" panel remembers one width. */
export function useResizableChatPanel(storageKey: string, defaultWidth = 420, min = 320, max = 900): ResizableChatPanelResult {
  const [width, setWidth] = useState(() => readStored(storageKey, defaultWidth, min, max));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const latestWidthRef = useRef(width);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { startX: e.clientX, startWidth: width };
    latestWidthRef.current = width;
    setIsDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    // The divider sits to the left of the panel, so dragging it left (negative
    // clientX delta) should grow the panel, same convention as the scrubber
    // divider's "above, dragging up grows it".
    const next = Math.min(max, Math.max(min, start.startWidth - (e.clientX - start.startX)));
    latestWidthRef.current = next;
    // Mutate the panel's flex-basis directly on the DOM node instead of via
    // setWidth — this panel docks a full chat thread, and routing every
    // pointermove (up to ~60/sec) through React state re-rendered that whole
    // subtree each time, which is what made dragging feel laggy. React only
    // re-syncs `width` once, on pointer-up, to the value already on screen
    // (no visual jump) — see that handler below.
    if (panelRef.current) panelRef.current.style.flexBasis = `${next}px`;
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    dragStartRef.current = null;
    setWidth(latestWidthRef.current);
    try {
      window.localStorage.setItem(storageKey, String(latestWidthRef.current));
    } catch {
      // private mode / storage disabled — resize still works, just won't persist
    }
  }

  return { width, isDragging, panelRef, dividerProps: { onPointerDown, onPointerMove, onPointerUp } };
}
