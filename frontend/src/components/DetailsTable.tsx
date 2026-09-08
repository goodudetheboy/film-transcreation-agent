import { useEffect, useRef, useState } from 'react';
import { BUILTIN_COLUMN_LABELS, type ColumnDoc, type DetailRow, type Film } from '../api/apiClient.types';
import { addColumn, addDetailRow, deleteDetailRow } from '../api/filmsApiClient';
import { formatClock } from '../utils/timeFormat';
import { provenanceLabel, provenanceModifier } from '../utils/detailRowProvenance';
import { detailRowReference } from '../utils/chatReferences';
import { beginChipDrag } from '../utils/chipDragDrop';
import { useResizableColumns } from '../utils/useResizableColumns';
import { TrashIcon } from './icons';
import { ConfirmModal } from './ConfirmModal';
import { DetailRowView } from './DetailRowView';
import { ResizableTh } from './ResizableTh';
import { ColInfoIcon } from './ColInfoIcon';

export interface DetailsTableProps {
  film: Film;
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

const SEGMENT_DESCRIPTION_HINT =
  "What's happening on screen during this moment — the visual/narrative context for the localizer, beyond just the dialogue.";
const GESTURE_HINT = 'Any notable gesture, body language, or physical action during this moment worth flagging for localization.';
const SOURCE_HINT = 'How this row was found — added by hand, discovered automatically on import, or found by a Discovery Agent pass.';

export function DetailsTable({
  film,
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
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnDescription, setNewColumnDescription] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { colWidth, resizerHandlers } = useResizableColumns(DEFAULT_COL_WIDTHS, DEFAULT_CUSTOM_COL_WIDTH, MIN_COL_WIDTH, MAX_COL_WIDTH);

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
    if (!showAddColumnModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowAddColumnModal(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddColumnModal]);

  async function handleDeleteConfirmed() {
    if (!deleteTargetId) return;
    const rowId = deleteTargetId;
    setBusy(true);
    try {
      await deleteDetailRow(film.id, rowId);
      onRowDeleted(rowId);
      setDeleteTargetId(null);
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
      const row = await addDetailRow(film.id, { startMs, endMs, values: {} });
      onRowAdded(row);
      setOpenRowId(row.id);
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
      const column = await addColumn(film.id, { name: newColumnName.trim(), description: newColumnDescription.trim() });
      onColumnAdded(column);
      setShowAddColumnModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add column');
    } finally {
      setBusy(false);
    }
  }

  const openRow = openRowId ? rows.find((r) => r.id === openRowId) : undefined;
  if (openRow) {
    return (
      <DetailRowView
        film={film}
        row={openRow}
        rows={rows}
        columns={columns}
        currentTimeMs={currentTimeMs}
        onBack={() => setOpenRowId(null)}
        onNavigate={setOpenRowId}
        onSeek={onSeek}
        onRowUpdated={onRowUpdated}
        onRowDeleted={onRowDeleted}
      />
    );
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
              const isActive = row.id === activeRowId;
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={isActive ? 'details-table__row--active' : undefined}
                  onPointerDown={(e) => beginChipDrag(detailRowReference(row), e)}
                  onClick={() => {
                    setOpenRowId(row.id);
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
                  <td
                    className="details-table__cell--nowrap-exempt"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => setDeleteTargetId(row.id)}
                      aria-label="Delete row"
                      title="Delete row"
                    >
                      <TrashIcon />
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

      {deleteTargetId &&
        (() => {
          const target = rows.find((r) => r.id === deleteTargetId);
          return (
            <ConfirmModal
              title="Delete this row?"
              body={
                target?.subtitleText
                  ? `"${target.subtitleText}" will be permanently removed from the details table. This can't be undone.`
                  : "This row will be permanently removed from the details table. This can't be undone."
              }
              busy={busy}
              onConfirm={handleDeleteConfirmed}
              onCancel={() => setDeleteTargetId(null)}
            />
          );
        })()}
    </div>
  );
}

export { BUILTIN_COLUMN_LABELS };
