import { useRef, useState } from 'react';

export interface ResizableColumnsResult {
  colWidth: (key: string) => number;
  resizerHandlers: {
    onResizerPointerDown: (e: React.PointerEvent<HTMLSpanElement>, key: string) => void;
    onResizerPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => void;
    onResizerPointerUp: (e: React.PointerEvent<HTMLSpanElement>) => void;
  };
}

/** Drag-to-resize column widths for a ResizableTh.tsx-based table header —
 * shared by DetailsTable.tsx and DiscoveryChatPanel.tsx's DiscoveryResultsModal
 * so both tables resize/overflow-scroll the same way instead of squeezing
 * columns to fit (which is what table-layout:fixed does with no explicit
 * widths at all). */
export function useResizableColumns(
  defaultWidths: Record<string, number>,
  defaultCustomWidth: number,
  minWidth = 60,
  maxWidth = 640,
): ResizableColumnsResult {
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  function colWidth(key: string): number {
    return colWidths[key] ?? defaultWidths[key] ?? defaultCustomWidth;
  }

  function onResizerPointerDown(e: React.PointerEvent<HTMLSpanElement>, key: string) {
    e.stopPropagation();
    dragRef.current = { key, startX: e.clientX, startWidth: colWidth(key) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onResizerPointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(maxWidth, Math.max(minWidth, drag.startWidth + (e.clientX - drag.startX)));
    setColWidths((prev) => ({ ...prev, [drag.key]: next }));
  }

  function onResizerPointerUp(e: React.PointerEvent<HTMLSpanElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return { colWidth, resizerHandlers: { onResizerPointerDown, onResizerPointerMove, onResizerPointerUp } };
}
