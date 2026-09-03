import { Button } from './Button';

export interface DraftRubric {
  /** Present only once persisted (the wizard's draft rubrics don't have one yet). */
  id?: string;
  name: string;
  description: string;
  weight: number;
}

export interface RubricsEditorProps {
  rubrics: DraftRubric[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<DraftRubric>) => void;
  onRemove: (index: number) => void;
}

/**
 * A controlled rubric-list editor — reused as-is by both the new-project
 * wizard's RubricsStep (purely local draft state, nothing persisted until
 * the project is created) and the workspace's rubrics tab (each callback
 * additionally syncs to the CRUD routes). Modeled on AgentKickoffPanel.tsx's
 * `.column-checklist` add/remove shape as the closest existing precedent.
 */
export function RubricsEditor({ rubrics, onAdd, onChange, onRemove }: RubricsEditorProps) {
  return (
    <div className="rubric-editor">
      {rubrics.length === 0 && <p className="results-placeholder">No rubrics yet.</p>}
      {rubrics.map((rubric, i) => (
        <div className="rubric-editor__row" key={rubric.id ?? i}>
          <input
            type="text"
            className="rubric-editor__name"
            placeholder="Name"
            aria-label={`Rubric ${i + 1} name`}
            value={rubric.name}
            onChange={(e) => onChange(i, { name: e.target.value })}
          />
          <input
            type="text"
            className="rubric-editor__description"
            placeholder="Description — what should the research agent look for?"
            aria-label={`Rubric ${i + 1} description`}
            value={rubric.description}
            onChange={(e) => onChange(i, { description: e.target.value })}
          />
          <select
            className="rubric-editor__weight"
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
          <Button variant="icon" tone="danger" onClick={() => onRemove(i)} aria-label={`Remove rubric ${i + 1}`}>
            ×
          </Button>
        </div>
      ))}
      <Button onClick={onAdd}>
        + Add rubric
      </Button>
    </div>
  );
}
