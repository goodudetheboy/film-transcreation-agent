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

  function ResizableTh({ colKey, children }: { colKey: string; children: ReactNode }) {
    return (
      <th>
        {children}
        <span
          className="details-table__col-resizer"
          onPointerDown={(e) => handleResizerPointerDown(e, colKey)}
          onPointerMove={handleResizerPointerMove}
          onPointerUp={handleResizerPointerUp}
        />
      </th>
    );
  }

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

  async function handleAddColumn() {
    const name = window.prompt('New column name?');
    if (!name || name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const column = await addColumn(film.id, { passcode, name: name.trim() });
      onColumnAdded(column);
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
              <ResizableTh colKey="start">Start</ResizableTh>
              <ResizableTh colKey="end">End</ResizableTh>
              <ResizableTh colKey="subtitle">Subtitle</ResizableTh>
              <ResizableTh colKey="segmentDescription">Segment Description</ResizableTh>
              <ResizableTh colKey="gesture">Gesture</ResizableTh>
              <ResizableTh colKey="notes">Notes</ResizableTh>
              {columns.map((c) => (
                <ResizableTh key={c.id} colKey={c.key}>
                  {c.name}
                </ResizableTh>
              ))}
              <ResizableTh colKey="source">Source</ResizableTh>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editingRowId === row.id;
              const isActive = row.id === activeRowId;
              const rowClassName = [isEditing && 'details-table__row--editing', isActive && 'details-table__row--active']
                .filter(Boolean)
                .join(' ');
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={rowClassName}
                  onClick={() => {
                    if (!isEditing) startEdit(row);
                    onSeek(row.startMs);
                  }}
                >
                  <td title={!isEditing ? formatClock(row.startMs) : undefined}>
                    {isEditing && draft ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={draft.startText}
                          size={7}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraft({ ...draft, startText: e.target.value })}
                          onBlur={(e) => commitStart(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn--ghost"
                          title="Set to current playhead position"
                          onClick={(e) => {
                            e.stopPropagation();
                            useCurrentForStart();
                          }}
                        >
                          ⏱
                        </button>
                      </span>
                    ) : (
                      formatClock(row.startMs)
                    )}
                  </td>
                  <td title={!isEditing ? formatClock(row.endMs) : undefined}>
                    {isEditing && draft ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={draft.endText}
                          size={7}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraft({ ...draft, endText: e.target.value })}
                          onBlur={(e) => commitEnd(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn--ghost"
                          title="Set to current playhead position"
                          onClick={(e) => {
                            e.stopPropagation();
                            useCurrentForEnd();
                          }}
                        >
                          ⏱
                        </button>
                      </span>
                    ) : (
                      formatClock(row.endMs)
                    )}
                  </td>
                  <td title={isEditing ? undefined : row.subtitleText}>
                    {isEditing && draft ? subtitleTextForRange(draft.startMs, draft.endMs) : row.subtitleText}
                  </td>
                  {(['segmentDescription', 'gesture', 'notes'] as const).map((key) => (
                    <td key={key} title={!isEditing ? row.values[key] : undefined}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftValue(key)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraftValue(key, e.target.value)}
                        />
                      ) : (
                        row.values[key]
                      )}
                    </td>
                  ))}
                  {columns.map((c) => (
                    <td key={c.id} title={!isEditing ? (row.values.custom[c.key] ?? '') : undefined}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftValue(c.key)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraftValue(c.key, e.target.value)}
                        />
                      ) : (
                        row.values.custom[c.key] ?? ''
                      )}
                    </td>
                  ))}
                  <td className="details-table__cell--nowrap-exempt">
                    <span className={`status-badge status-badge--${provenanceModifier(row)}`}>{provenanceLabel(row)}</span>
                  </td>
                  <td className="details-table__cell--nowrap-exempt" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn" disabled={busy} onClick={() => saveEdit(row.id)}>
                          Save
                        </button>
                        <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => handleDelete(row.id)}>
                        Delete
                      </button>
                    )}
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
        <button type="button" className="btn" disabled={busy} onClick={handleAddColumn}>
          + Add column
        </button>
      </div>
    </div>
  );
}

export { BUILTIN_COLUMN_LABELS };
