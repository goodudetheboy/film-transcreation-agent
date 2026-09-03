import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BUILTIN_COLUMN_LABELS,
  type ColumnDoc,
  type DetailRow,
  type DetailRowValues,
  type Film,
} from '../api/apiClient.types';
import { addColumn, addDetailRow, deleteDetailRow, updateDetailRow } from '../api/filmsApiClient';
import { formatClock, parseClockToMs } from '../utils/timeFormat';
import { ClockIcon, InfoIcon } from './icons';

export interface DetailsTableProps {
  film: Film;
  passcode: string;
  rows: DetailRow[];
  columns: ColumnDoc[];
  currentTimeMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  onRowAdded: (row: DetailRow) => void;
  onRowUpdated: (row: DetailRow) => void;
  onRowDeleted: (rowId: string) => void;
  onColumnAdded: (column: ColumnDoc) => void;
}

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  start: 90,
  end: 90,
  subtitle: 260,
  segmentDescription: 260,
  gesture: 170,
  notes: 220,
  source: 190,
  actions: 130,
};
const DEFAULT_CUSTOM_COL_WIDTH = 200;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 640;

const NEW_ROW_DEFAULT_SPAN_MS = 2000;

function provenanceLabel(row: DetailRow): string {
  if (row.provenance.type === 'user-marked') return 'Marked by you';
  if (row.provenance.type === 'agent-discovered') {
    // agentNumber 0 is the sentinel for the automatic pass run during film prep
    // (see backend/src/services/filmPrepPipeline.ts) — not a real numbered agent.
    if (row.provenance.agentNumber === 0) return 'Discovered on import';
    return `Agent #${row.provenance.agentNumber} · Pass #${row.provenance.passNumber}`;
  }
  return `AI-assisted · Agent #${row.provenance.agentNumber}`;
}

function provenanceModifier(row: DetailRow): string {
  return row.provenance.type === 'user-marked' ? 'user-marked' : row.provenance.type === 'agent-discovered' ? 'agent-discovered' : 'ai-assisted';
}

interface Draft {
  startMs: number;
  endMs: number;
  startText: string;
  endText: string;
  values: DetailRowValues;
}

/** Defined at module scope, not inside DetailsTable's render body — an inline
 * component redefined on every render is a *new type* to React, so every
 * `setColWidths` update during a drag would tear down and recreate this
 * `<span>`, silently losing the `setPointerCapture()` mid-gesture (the drag
 * would only keep tracking while the cursor stayed exactly over the 6px
 * sliver). Keeping it stable here is what makes capture survive the drag. */
function ResizableTh({
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

/** Small info-icon tooltip trigger — visible affordance that a header has
 * more context on hover, since a bare `title` attribute gives no visual cue. */
function ColInfoIcon({ text }: { text: string }) {
  return (
    <span className="details-table__col-info" title={text}>
      <InfoIcon width={12} height={12} />
    </span>
  );
}

const SEGMENT_DESCRIPTION_HINT =
  "What's happening on screen during this moment — the visual/narrative context for the localizer, beyond just the dialogue.";
const GESTURE_HINT = 'Any notable gesture, body language, or physical action during this moment worth flagging for localization.';
const SOURCE_HINT = 'How this row was found — added by hand, discovered automatically on import, or found by a Discovery Agent pass.';

export function DetailsTable({
  film,
  passcode,
  rows,
  columns,
  currentTimeMs,
  durationMs,
  onSeek,
  onRowAdded,
  onRowUpdated,
  onRowDeleted,
  onColumnAdded,
}: DetailsTableProps) {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnDescription, setNewColumnDescription] = useState('');
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = film.subtitle?.entries ?? [];

  function subtitleTextForRange(startMs: number, endMs: number): string {
    return entries
      .filter((e) => e.startMs < endMs && e.endMs > startMs)
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => e.text)
      .join(' ');
  }

  function colWidth(key: string): number {
    return colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? DEFAULT_CUSTOM_COL_WIDTH;
  }

  function handleResizerPointerDown(e: React.PointerEvent<HTMLSpanElement>, key: string) {
    e.stopPropagation();
    dragRef.current = { key, startX: e.clientX, startWidth: colWidth(key) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizerPointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, drag.startWidth + (e.clientX - drag.startX)));
    setColWidths((prev) => ({ ...prev, [drag.key]: next }));
  }

  function handleResizerPointerUp(e: React.PointerEvent<HTMLSpanElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const resizerHandlers = {
    onResizerPointerDown: handleResizerPointerDown,
    onResizerPointerMove: handleResizerPointerMove,
    onResizerPointerUp: handleResizerPointerUp,
  };

  function isRowActive(row: DetailRow) {
    return currentTimeMs >= row.startMs && currentTimeMs < row.endMs;
  }

  const activeRowId = rows.find(isRowActive)?.id ?? null;

  useEffect(() => {
    if (!activeRowId || !scrollRef.current) return;
    scrollRef.current
      .querySelector<HTMLElement>(`[data-row-id="${activeRowId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeRowId]);

  useEffect(() => {
    if (!editingRowId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelEdit();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRowId]);

  useEffect(() => {
    if (!showAddColumnModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowAddColumnModal(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddColumnModal]);

  function startEdit(row: DetailRow) {
    setEditingRowId(row.id);
    setDraft({
      startMs: row.startMs,
      endMs: row.endMs,
      startText: formatClock(row.startMs),
      endText: formatClock(row.endMs),
      values: { ...row.values, custom: { ...row.values.custom } },
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingRowId(null);
    setDraft(null);
  }

  function commitStart(rawText: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const ms = parseClockToMs(rawText);
      if (ms === null || ms < 0 || ms >= prev.endMs) return { ...prev, startText: formatClock(prev.startMs) };
      return { ...prev, startMs: ms, startText: formatClock(ms) };
    });
  }

  function commitEnd(rawText: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const ms = parseClockToMs(rawText);
      if (ms === null || ms <= prev.startMs) return { ...prev, endText: formatClock(prev.endMs) };
      return { ...prev, endMs: ms, endText: formatClock(ms) };
    });
  }

  function useCurrentForStart() {
    setDraft((prev) => {
      if (!prev || currentTimeMs < 0 || currentTimeMs >= prev.endMs) return prev;
      return { ...prev, startMs: currentTimeMs, startText: formatClock(currentTimeMs) };
    });
  }

  function useCurrentForEnd() {
    setDraft((prev) => {
      if (!prev || currentTimeMs <= prev.startMs) return prev;
      return { ...prev, endMs: currentTimeMs, endText: formatClock(currentTimeMs) };
    });
  }

  async function saveEdit(rowId: string) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateDetailRow(film.id, rowId, {
        passcode,
        startMs: draft.startMs,
        endMs: draft.endMs,
        values: draft.values,
      });
      onRowUpdated(updated);
      setEditingRowId(null);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save row');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rowId: string) {
    setBusy(true);
    try {
      await deleteDetailRow(film.id, rowId, passcode);
      onRowDeleted(rowId);
      if (editingRowId === rowId) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete row');
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAdd() {
    setBusy(true);
    setError(null);
    try {
      const startMs = currentTimeMs;
      const cap = durationMs > 0 ? durationMs : startMs + NEW_ROW_DEFAULT_SPAN_MS;
      const endMs = Math.max(startMs + 1, Math.min(startMs + NEW_ROW_DEFAULT_SPAN_MS, cap));
      const row = await addDetailRow(film.id, { passcode, startMs, endMs, values: {} });
      onRowAdded(row);
      startEdit(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add row');
    } finally {
      setBusy(false);
    }
  }

  function openAddColumnModal() {
    setNewColumnName('');
    setNewColumnDescription('');
    setError(null);
    setShowAddColumnModal(true);
  }

  function cancelAddColumn() {
    setShowAddColumnModal(false);
  }

  async function submitAddColumn() {
    if (newColumnName.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const column = await addColumn(film.id, { passcode, name: newColumnName.trim(), description: newColumnDescription.trim() });
      onColumnAdded(column);
      setShowAddColumnModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add column');
    } finally {
      setBusy(false);
    }
  }

  function draftValue(key: string): string {
    if (!draft) return '';
    if (key === 'segmentDescription' || key === 'gesture' || key === 'notes') return draft.values[key];
    return draft.values.custom[key] ?? '';
  }

  function setDraftValue(key: string, value: string) {
    if (!draft) return;
    if (key === 'segmentDescription' || key === 'gesture' || key === 'notes') {
      setDraft({ ...draft, values: { ...draft.values, [key]: value } });
    } else {
      setDraft({ ...draft, values: { ...draft.values, custom: { ...draft.values.custom, [key]: value } } });
    }
  }

  return (
    <div className="details-table-wrap">
      {error && <p className="passcode-gate__error">{error}</p>}
      <div className="details-table-scroll" ref={scrollRef}>
        <table className="details-table">
          <colgroup>
            <col style={{ width: colWidth('start') }} />
            <col style={{ width: colWidth('end') }} />
            <col style={{ width: colWidth('subtitle') }} />
            <col style={{ width: colWidth('segmentDescription') }} />
            <col style={{ width: colWidth('gesture') }} />
            <col style={{ width: colWidth('notes') }} />
            {columns.map((c) => (
              <col key={c.id} style={{ width: colWidth(c.key) }} />
            ))}
            <col style={{ width: colWidth('source') }} />
            <col style={{ width: colWidth('actions') }} />
          </colgroup>
          <thead>
            <tr>
              <ResizableTh colKey="start" {...resizerHandlers}>Start</ResizableTh>
              <ResizableTh colKey="end" {...resizerHandlers}>End</ResizableTh>
              <ResizableTh colKey="subtitle" {...resizerHandlers}>Subtitle</ResizableTh>
              <ResizableTh colKey="segmentDescription" title={SEGMENT_DESCRIPTION_HINT} {...resizerHandlers}>
                Segment Description
                <ColInfoIcon text={SEGMENT_DESCRIPTION_HINT} />
              </ResizableTh>
              <ResizableTh colKey="gesture" title={GESTURE_HINT} {...resizerHandlers}>
                Gesture
                <ColInfoIcon text={GESTURE_HINT} />
              </ResizableTh>
              <ResizableTh colKey="notes" {...resizerHandlers}>Notes</ResizableTh>
              {columns.map((c) => (
                <ResizableTh key={c.id} colKey={c.key} title={c.description || undefined} {...resizerHandlers}>
                  {c.name}
                  {c.description && <ColInfoIcon text={c.description} />}
                </ResizableTh>
              ))}
              <ResizableTh colKey="source" title={SOURCE_HINT} {...resizerHandlers}>
                Source
                <ColInfoIcon text={SOURCE_HINT} />
              </ResizableTh>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpenInModal = editingRowId === row.id;
              const isActive = row.id === activeRowId;
              const rowClassName = [isOpenInModal && 'details-table__row--editing', isActive && 'details-table__row--active']
                .filter(Boolean)
                .join(' ');
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={rowClassName}
                  onClick={() => {
                    startEdit(row);
                    onSeek(row.startMs);
                  }}
                >
                  <td title={formatClock(row.startMs)}>{formatClock(row.startMs)}</td>
                  <td title={formatClock(row.endMs)}>{formatClock(row.endMs)}</td>
                  <td title={row.subtitleText}>{row.subtitleText}</td>
                  {(['segmentDescription', 'gesture', 'notes'] as const).map((key) => (
                    <td key={key} title={row.values[key]}>
                      {row.values[key]}
                    </td>
                  ))}
                  {columns.map((c) => (
                    <td key={c.id} title={row.values.custom[c.key] ?? ''}>
                      {row.values.custom[c.key] ?? ''}
                    </td>
                  ))}
                  <td className="details-table__cell--nowrap-exempt">
                    <span className={`status-badge status-badge--${provenanceModifier(row)}`}>{provenanceLabel(row)}</span>
                  </td>
                  <td className="details-table__cell--nowrap-exempt" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => handleDelete(row.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" className="btn" disabled={busy} onClick={handleManualAdd}>
          + Manually add details
        </button>
        <button type="button" className="btn" disabled={busy} onClick={openAddColumnModal}>
          + Add column
        </button>
      </div>

      {editingRowId && draft && (
        <div className="modal-backdrop" onClick={() => !busy && cancelEdit()}>
          <div className="modal detail-row-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <p className="modal__title">Edit detail</p>
              <button type="button" className="modal__close" onClick={cancelEdit} disabled={busy}>
                ×
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Start</label>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={draft.startText}
                    onChange={(e) => setDraft({ ...draft, startText: e.target.value })}
                    onBlur={(e) => commitStart(e.target.value)}
                  />
                  <button type="button" className="btn btn--ghost" title="Set to current playhead position" onClick={useCurrentForStart}>
                    <ClockIcon width={14} height={14} />
                  </button>
                </span>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>End</label>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={draft.endText}
                    onChange={(e) => setDraft({ ...draft, endText: e.target.value })}
                    onBlur={(e) => commitEnd(e.target.value)}
                  />
                  <button type="button" className="btn btn--ghost" title="Set to current playhead position" onClick={useCurrentForEnd}>
                    <ClockIcon width={14} height={14} />
                  </button>
                </span>
              </div>
            </div>

            <div className="field">
              <label>Subtitle</label>
              <p className="detail-row-modal__readonly">{subtitleTextForRange(draft.startMs, draft.endMs) || '—'}</p>
            </div>

            {(['segmentDescription', 'gesture', 'notes'] as const).map((key) => (
              <div className="field" key={key}>
                <label>{key === 'segmentDescription' ? 'Segment Description' : key === 'gesture' ? 'Gesture' : 'Notes'}</label>
                <textarea value={draftValue(key)} onChange={(e) => setDraftValue(key, e.target.value)} />
              </div>
            ))}

            {columns.map((c) => (
              <div className="field" key={c.id}>
                <label>{c.name}</label>
                <textarea value={draftValue(c.key)} onChange={(e) => setDraftValue(c.key, e.target.value)} />
              </div>
            ))}

            <div className="field">
              <label>Source</label>
              <span className={`status-badge status-badge--${provenanceModifier(rows.find((r) => r.id === editingRowId)!)}`}>
                {provenanceLabel(rows.find((r) => r.id === editingRowId)!)}
              </span>
            </div>

            {error && <p className="passcode-gate__error">{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => handleDelete(editingRowId)}>
                Delete
              </button>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => saveEdit(editingRowId)}>
                  Save
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {showAddColumnModal && (
        <div className="modal-backdrop" onClick={() => !busy && cancelAddColumn()}>
          <form
            className="modal add-column-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void submitAddColumn();
            }}
          >
            <div className="modal__header">
              <p className="modal__title">Add column</p>
              <button type="button" className="modal__close" onClick={cancelAddColumn} disabled={busy}>
                ×
              </button>
            </div>

            <div className="field">
              <label htmlFor="new-column-name">Name</label>
              <input
                id="new-column-name"
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="new-column-description">Description</label>
              <textarea
                id="new-column-description"
                placeholder="What should go in this column, and when?"
                value={newColumnDescription}
                onChange={(e) => setNewColumnDescription(e.target.value)}
              />
              <p className="field__hint">
                Shown as a tooltip on the column header, and given to the AI discovery agents as context for what to
                fill in — make sure it's accurate.
              </p>
            </div>

            {error && <p className="passcode-gate__error">{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" disabled={busy} onClick={cancelAddColumn}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || newColumnName.trim() === ''}>
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export { BUILTIN_COLUMN_LABELS };
