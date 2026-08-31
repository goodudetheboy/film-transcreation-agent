import type { DetailRow } from '../api/apiClient.types';
import { formatClock } from '../utils/timeFormat';

export interface DetailRowPickerProps {
  rows: DetailRow[];
  selected: Set<string>;
  onToggle: (rowId: string) => void;
  /** Rows already imported into the current project — shown disabled/checked, not toggleable. */
  alreadyImportedIds?: Set<string>;
}

/**
 * A checkbox table over a film's curated DetailRows — the shared "pick which
 * details to research" UI reused by the new-project wizard's selection step
 * and the workspace's "+ Manually add details" / research-kickoff "Custom"
 * flows. Deliberately a purpose-built lightweight table rather than reusing
 * DetailsTable.tsx's full editing/column-resize machinery, which this
 * selection-only use case doesn't need.
 */
export function DetailRowPicker({ rows, selected, onToggle, alreadyImportedIds }: DetailRowPickerProps) {
  if (rows.length === 0) {
    return <p className="results-placeholder">This film has no Details rows yet.</p>;
  }

  return (
    <div className="details-table-wrap">
      <div className="details-table-scroll">
        <table className="details-table">
          <thead>
            <tr>
              <th />
              <th>Time</th>
              <th>Subtitle</th>
              <th>Segment description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const imported = alreadyImportedIds?.has(row.id) ?? false;
              return (
                <tr key={row.id} className={imported ? 'details-table__row--imported' : undefined}>
                  <td>
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
                  <td>{row.values.segmentDescription}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
