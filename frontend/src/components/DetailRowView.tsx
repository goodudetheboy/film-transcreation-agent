import { useEffect, useState } from 'react';
import type { ColumnDoc, DetailRow, DetailRowValues, Film } from '../api/apiClient.types';
import { deleteDetailRow, updateDetailRow } from '../api/filmsApiClient';
import { formatClock, parseClockToMs } from '../utils/timeFormat';
import { ClockIcon, TrashIcon } from './icons';
import { ConfirmModal } from './ConfirmModal';
import { provenanceLabel, provenanceModifier } from '../utils/detailRowProvenance';

export interface DetailRowViewProps {
  film: Film;
  row: DetailRow;
  /** Every row in the table, in the same order it's rendered there — used for
   * Previous/Next and the "load another detail" dropdown, same as
   * ProjectItemView.tsx's allItems. */
  rows: DetailRow[];
  columns: ColumnDoc[];
  currentTimeMs: number;
  onBack: () => void;
  onNavigate: (rowId: string) => void;
  onSeek: (ms: number) => void;
  onRowUpdated: (row: DetailRow) => void;
  onRowDeleted: (rowId: string) => void;
}

interface Draft {
  startMs: number;
  endMs: number;
  startText: string;
  endText: string;
  values: DetailRowValues;
}

function makeDraft(row: DetailRow): Draft {
  return {
    startMs: row.startMs,
    endMs: row.endMs,
    startText: formatClock(row.startMs),
    endText: formatClock(row.endMs),
    values: { ...row.values, custom: { ...row.values.custom } },
  };
}

/**
 * The Details tab's "open one row" state — renders IN PLACE of the table
 * inside DetailsTable.tsx, never as a modal/popup. Same pattern as
 * ProjectItemView.tsx: back/prev/next nav + a "load another" dropdown, with
 * the video/scrubber panel (a sibling in FilmWorkspaceView.tsx) staying in
 * sync via onSeek the whole time. No chat-toggle button here, unlike
 * ProjectItemView — Discovery chat is film-scoped, not row-scoped, and its
 * toggle already lives in FilmWorkspaceView.tsx's toolbar above this.
 */
export function DetailRowView({
  film,
  row,
  rows,
  columns,
  currentTimeMs,
  onBack,
  onNavigate,
  onSeek,
  onRowUpdated,
  onRowDeleted,
}: DetailRowViewProps) {
  const [draft, setDraft] = useState<Draft>(() => makeDraft(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries = film.subtitle?.entries ?? [];
  const index = rows.findIndex((r) => r.id === row.id);
  const prev = index > 0 ? rows[index - 1] : undefined;
  const next = index >= 0 && index < rows.length - 1 ? rows[index + 1] : undefined;

  useEffect(() => {
    setDraft(makeDraft(row));
    setError(null);
  }, [row]);

  // Keep the video scrubbed to whichever row is open — same parity with the
  // rest of the workspace DetailsTable's row-click already had.
  useEffect(() => {
    onSeek(row.startMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  function subtitleTextForRange(startMs: number, endMs: number): string {
    return entries
      .filter((e) => e.startMs < endMs && e.endMs > startMs)
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => e.text)
      .join(' ');
  }

  function commitStart(rawText: string) {
    setDraft((prev) => {
      const ms = parseClockToMs(rawText);
      if (ms === null || ms < 0 || ms >= prev.endMs) return { ...prev, startText: formatClock(prev.startMs) };
      return { ...prev, startMs: ms, startText: formatClock(ms) };
    });
  }

  function commitEnd(rawText: string) {
    setDraft((prev) => {
      const ms = parseClockToMs(rawText);
      if (ms === null || ms <= prev.startMs) return { ...prev, endText: formatClock(prev.endMs) };
      return { ...prev, endMs: ms, endText: formatClock(ms) };
    });
  }

  function useCurrentForStart() {
    setDraft((prev) => {
      if (currentTimeMs < 0 || currentTimeMs >= prev.endMs) return prev;
      return { ...prev, startMs: currentTimeMs, startText: formatClock(currentTimeMs) };
    });
  }

  function useCurrentForEnd() {
    setDraft((prev) => {
      if (currentTimeMs <= prev.startMs) return prev;
      return { ...prev, endMs: currentTimeMs, endText: formatClock(currentTimeMs) };
    });
  }

  function draftValue(key: string): string {
    if (key === 'segmentDescription' || key === 'gesture' || key === 'notes') return draft.values[key];
    return draft.values.custom[key] ?? '';
  }

  function setDraftValue(key: string, value: string) {
    if (key === 'segmentDescription' || key === 'gesture' || key === 'notes') {
      setDraft({ ...draft, values: { ...draft.values, [key]: value } });
    } else {
      setDraft({ ...draft, values: { ...draft.values, custom: { ...draft.values.custom, [key]: value } } });
    }
  }

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateDetailRow(film.id, row.id, {
        startMs: draft.startMs,
        endMs: draft.endMs,
        values: draft.values,
      });
      onRowUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save row');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConfirmed() {
    setBusy(true);
    try {
      await deleteDetailRow(film.id, row.id);
      onRowDeleted(row.id);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete row');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-row-view">
      <div className="detail-row-view__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Back to table
        </button>
        <p className="detail-row-view__title">
          {formatClock(row.startMs)}–{formatClock(row.endMs)}
        </p>
        <div className="detail-row-view__nav">
          <button type="button" className="btn" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
            ← Previous
          </button>
          <button type="button" className="btn" disabled={!next} onClick={() => next && onNavigate(next.id)}>
            Next →
          </button>
          {rows.length > 1 && (
            <select value={row.id} onChange={(e) => onNavigate(e.target.value)} aria-label="Load another detail">
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatClock(r.startMs)} — {r.subtitleText.slice(0, 40) || '(visual only)'}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="detail-row-view__body">
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
          <p className="detail-row-view__readonly">{subtitleTextForRange(draft.startMs, draft.endMs) || '—'}</p>
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
          <span className={`status-badge status-badge--${provenanceModifier(row)}`}>{provenanceLabel(row)}</span>
        </div>

        {error && <p className="passcode-gate__error">{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete row"
            title="Delete row"
          >
            <TrashIcon />
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={saveEdit}>
            Save
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete this row?"
          body={
            row.subtitleText
              ? `"${row.subtitleText}" will be permanently removed from the details table. This can't be undone.`
              : "This row will be permanently removed from the details table. This can't be undone."
          }
          busy={busy}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
