import type { ReactNode } from 'react';

/** Defined at module scope, not inside a table component's render body — an
 * inline component redefined on every render is a *new type* to React, so
 * every column-width update during a drag would tear down and recreate this
 * `<span>`, silently losing the `setPointerCapture()` mid-gesture (the drag
 * would only keep tracking while the cursor stayed exactly over the 6px
 * sliver). Keeping it stable here is what makes capture survive the drag.
 * Shared by DetailsTable.tsx and DiscoveryChatPanel.tsx's DiscoveryResultsModal,
 * paired with useResizableColumns.ts. */
export function ResizableTh({
  colKey,
  children,
  title,
  onResizerPointerDown,
  onResizerPointerMove,
  onResizerPointerUp,
}: {
  colKey: string;
  children: ReactNode;
  /** Tooltip shown on hover — used for a custom column's description. */
  title?: string;
  onResizerPointerDown: (e: React.PointerEvent<HTMLSpanElement>, key: string) => void;
  onResizerPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onResizerPointerUp: (e: React.PointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <th title={title}>
      {children}
      <span
        className="details-table__col-resizer"
        onPointerDown={(e) => onResizerPointerDown(e, colKey)}
        onPointerMove={onResizerPointerMove}
        onPointerUp={onResizerPointerUp}
      />
    </th>
  );
}
