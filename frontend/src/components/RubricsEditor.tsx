export interface DraftRubric {
  /** Present only once persisted (the wizard's draft rubrics don't have one yet). */
  id?: string;
  name: string;
  description: string;
  weight: number;
  /** Whether this rubric's concern is tied to socially-current content (slang, memes,
   * viral references) that the Trend Agent should search live sources for. Optional
   * only because older/local draft state may predate this field — treat missing as
   * false everywhere it's read. */
  trendEligible?: boolean;
}

export interface RubricsEditorProps {
  rubrics: DraftRubric[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<DraftRubric>) => void;
  onRemove: (index: number) => void;
  /** Appends the server's placeholder rubric set (see backend's DEFAULT_RUBRICS) —
   * a quick-pass starting point, not a replacement for real rubric design. */
  onGenerateDefaults: () => void;
}

/**
 * A controlled rubric-list editor — reused as-is by both the new-project
 * wizard's RubricsStep (purely local draft state, nothing persisted until
 * the project is created) and the workspace's rubrics tab (each callback
 * additionally syncs to the CRUD routes). Styled as a stack of cards using
 * the same .finding-card language as ProjectItemView's rubric *score* cards
 * (index circle, weight badge, expandable body) — a rubric being authored
 * here should read as the same object you later see scored there.
 */
export function RubricsEditor({ rubrics, onAdd, onChange, onRemove, onGenerateDefaults }: RubricsEditorProps) {
  return (
    <div className="rubric-editor">
      {rubrics.length === 0 && <p className="results-placeholder">No rubrics yet — add one, or start from the defaults below.</p>}
      {rubrics.map((rubric, i) => (
        <div className="finding-card rubric-card" key={rubric.id ?? i}>
          <div className="finding-card__top">
            <span className="finding-card__index">{i + 1}</span>
            <input
              type="text"
              className="rubric-card__name"
              placeholder="Rubric name"
              aria-label={`Rubric ${i + 1} name`}
              value={rubric.name}
              onChange={(e) => onChange(i, { name: e.target.value })}
            />
            <select
              className="nav-select rubric-card__weight"
              aria-label={`Rubric ${i + 1} weight`}
              value={rubric.weight}
              onChange={(e) => onChange(i, { weight: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((w) => (
                <option key={w} value={w}>
                  weight {w}
                </option>
              ))}
            </select>
            <button type="button" className="modal__close" onClick={() => onRemove(i)} aria-label={`Remove rubric ${i + 1}`}>
              ×
            </button>
          </div>

          <textarea
            className="rubric-card__description"
            placeholder="Description — what should the research agent look for?"
            aria-label={`Rubric ${i + 1} description`}
            value={rubric.description}
            onChange={(e) => onChange(i, { description: e.target.value })}
          />

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rubric.trendEligible ?? false}
              onChange={(e) => onChange(i, { trendEligible: e.target.checked })}
            />
            🔥 Trend-eligible — let the Trend Agent search live sources for this
          </label>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={onAdd}>
          + Add rubric
        </button>
        <button type="button" className="btn btn--ghost" onClick={onGenerateDefaults}>
          Use default rubrics
        </button>
      </div>
    </div>
  );
}
