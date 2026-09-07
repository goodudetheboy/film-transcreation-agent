import { BUILTIN_COLUMN_LABELS, type ColumnDoc, type DetailRow } from '../api/apiClient.types';
import { formatClock } from '../utils/timeFormat';

export interface DetailRowPickerProps {
  rows: DetailRow[];
  selected: Set<string>;
  onToggle: (rowId: string) => void;
  /** Rows already imported into the current project — shown disabled/checked, not toggleable. */
  alreadyImportedIds?: Set<string>;
  /** The film's custom columns (from listDetails' `columns`) — rendered after the
   * built-in ones, same set DetailsTable.tsx shows. Omit to show only built-ins. */
  columns?: ColumnDoc[];
  /** Selects/deselects every selectable (not already-imported) row at once. Omit
   * to hide the select-all checkbox. */
  onToggleAll?: () => void;
}

const BUILTIN_KEYS = ['segmentDescription', 'gesture', 'notes'] as const;

/**
 * A checkbox table over a film's curated DetailRows — the shared "pick which
 * details to research" UI reused by the new-project wizard's selection step
 * and the workspace's "+ Manually add details" / research-kickoff "Custom"
 * flows. Deliberately a purpose-built lightweight table rather than reusing
 * DetailsTable.tsx's full editing/column-resize machinery, which this
 * selection-only use case doesn't need — but mirrors its column enumeration
 * (built-ins + custom columns) so nothing is hidden here that's visible there.
 */
export function DetailRowPicker({ rows, selected, onToggle, alreadyImportedIds, columns = [], onToggleAll }: DetailRowPickerProps) {
  if (rows.length === 0) {
    return <p className="results-placeholder">This film has no Details rows yet.</p>;
  }

  const selectableRows = rows.filter((row) => !(alreadyImportedIds?.has(row.id) ?? false));
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selected.has(row.id));

  return (
    <div className="details-table-wrap details-table-wrap--standalone">
      <div className="details-table-scroll">
        <table className="details-table">
          <thead>
            <tr>
              <th className="details-table__checkbox-col">
                {onToggleAll && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                  />
                )}
              </th>
              <th>Time</th>
              <th>Subtitle</th>
              {BUILTIN_KEYS.map((key) => (
                <th key={key}>{BUILTIN_COLUMN_LABELS[key]}</th>
              ))}
              {columns.map((c) => (
                <th key={c.id} title={c.description || undefined}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const imported = alreadyImportedIds?.has(row.id) ?? false;
              return (
                <tr key={row.id} className={imported ? 'details-table__row--imported' : undefined}>
                  <td className="details-table__checkbox-col">
                    <input
                      type="checkbox"
                      checked={imported || selected.has(row.id)}
                      disabled={imported}
                      onChange={() => onToggle(row.id)}
                      aria-label={`Select row at ${formatClock(row.startMs)}`}
                    />
                  </td>
                  <td className="details-table__cell--nowrap-exempt">
                    {formatClock(row.startMs)}–{formatClock(row.endMs)}
                  </td>
                  <td>{row.subtitleText || <em>Visual only</em>}</td>
                  {BUILTIN_KEYS.map((key) => (
                    <td key={key}>{row.values[key]}</td>
                  ))}
                  {columns.map((c) => (
                    <td key={c.id}>{row.values.custom[c.key] ?? ''}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
