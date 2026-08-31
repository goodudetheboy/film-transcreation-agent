import { useState } from 'react';
import type { ProjectItem, Rubric } from '../api/apiClient.types';
import { updateItemScore } from '../api/projectsApiClient';
import { formatClock } from '../utils/timeFormat';
import { ResearchChatPanel } from './ResearchChatPanel';

export interface DetailExpansionPanelProps {
  projectId: string;
  passcode: string;
  testMode: boolean;
  item: ProjectItem;
  rubrics: Rubric[];
  allItems: ProjectItem[];
  onClose: () => void;
  onNavigate: (itemId: string) => void;
  onScorePatched: (itemId: string, patch: Partial<ProjectItem>) => void;
}

function ScoreBlock({
  rubric,
  item,
  projectId,
  passcode,
  onScorePatched,
}: {
  rubric: Rubric;
  item: ProjectItem;
  projectId: string;
  passcode: string;
  onScorePatched: DetailExpansionPanelProps['onScorePatched'];
}) {
  const existing = item.scores.find((s) => s.rubricId === rubric.id);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(existing?.score ?? 0);
  const [reasoning, setReasoning] = useState(existing?.reasoning ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateItemScore(projectId, item.id, rubric.id, { passcode, score, reasoning });
      onScorePatched(item.id, updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const tier = (existing?.score ?? 0) >= 7 ? 'high' : (existing?.score ?? 0) >= 4 ? 'mid' : 'low';

  return (
    <div className="finding-card">
      <div className="finding-card__top">
        <p className="finding-card__rubric">
          {rubric.name} <span className="results-placeholder">(weight {rubric.weight})</span>
        </p>
        {existing && (
          <span className={`score-chip score-chip--${tier}`}>
            {existing.score}
            <span className="score-chip__max">/10</span>
          </span>
        )}
      </div>

      {!editing ? (
        <>
          <p className="finding-card__text">{existing?.reasoning || <em>Not yet scored.</em>}</p>
          {existing?.evidence && (
            <p className="finding-card__text">
              <strong>Evidence: </strong>
              {existing.evidence}
            </p>
          )}
          {existing?.userNote && (
            <p className="finding-card__text">
              <strong>Note: </strong>
              {existing.userNote}
            </p>
          )}
          {existing?.sources && existing.sources.length > 0 && (
            <div className="source-list">
              {existing.sources.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" className="source-link">
                  {src}
                </a>
              ))}
            </div>
          )}
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Edit
          </button>
        </>
      ) : (
        <div className="field">
          <label>Score (0-10)</label>
          <input type="number" min={0} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} />
          <label>Reasoning</label>
          <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The detail modal, adapting DetailsTable.tsx's `.modal-backdrop`/`.modal
 * .detail-row-modal` pattern — Start/End/Subtitle/rubric blocks/suggested
 * change/Previous-Next nav, plus a docked chat pane. */
export function DetailExpansionPanel({
  projectId,
  passcode,
  testMode,
  item,
  rubrics,
  allItems,
  onClose,
  onNavigate,
  onScorePatched,
}: DetailExpansionPanelProps) {
  const index = allItems.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? allItems[index - 1] : undefined;
  const next = index >= 0 && index < allItems.length - 1 ? allItems[index + 1] : undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-row-modal project-item-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">
            {formatClock(item.startMs)}–{formatClock(item.endMs)}
          </p>
          <button type="button" className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="project-item-modal__body">
          <div className="project-item-modal__detail">
            <div className="field">
              <label>Subtitle</label>
              <p>{item.subtitleText || <em>Visual only</em>}</p>
            </div>
            <div className="field">
              <label>Scene / segment description</label>
              <p>{item.sceneDescription}</p>
            </div>

            {item.summary && (
              <div className="verdict-block">
                <span className={`verdict-badge verdict-badge--${item.shouldTranscreate ? 'change' : 'no-change'}`}>
                  {item.shouldTranscreate ? 'Needs Change' : 'Fine As-Is'}
                </span>
                <p className="verdict-block__text">{item.summary}</p>
              </div>
            )}

            {item.suggestedReplacement && (
              <div className="replacement-card">
                <p className="replacement-card__label">Suggested replacement</p>
                <p className="replacement-card__text">{item.suggestedReplacement.text}</p>
                <p className="replacement-card__why">{item.suggestedReplacement.justification}</p>
              </div>
            )}

            {rubrics.map((rubric) => (
              <ScoreBlock
                key={rubric.id}
                rubric={rubric}
                item={item}
                projectId={projectId}
                passcode={passcode}
                onScorePatched={onScorePatched}
              />
            ))}

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
                ← Previous
              </button>
              <button type="button" className="btn" disabled={!next} onClick={() => next && onNavigate(next.id)}>
                Next →
              </button>
              {allItems.length > 1 && (
                <select value={item.id} onChange={(e) => onNavigate(e.target.value)} aria-label="Jump to item">
                  {allItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {formatClock(i.startMs)} — {i.subtitleText.slice(0, 40) || '(visual only)'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="project-item-modal__chat">
            <ResearchChatPanel projectId={projectId} passcode={passcode} testMode={testMode} itemId={item.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
