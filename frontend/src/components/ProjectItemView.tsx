import { useEffect, useState } from 'react';
import type { ProjectItem, Rubric } from '../api/apiClient.types';
import { updateItemScore } from '../api/projectsApiClient';
import { formatClock } from '../utils/timeFormat';
import { ResearchChatPanel } from './ResearchChatPanel';

/** Relative age string for a Trend Suggestion's publishedDate, so a reviewer can judge
 * staleness themselves rather than trusting a trend suggestion blindly. */
function describeAge(publishedDate: string): string {
  const days = Math.floor((Date.now() - new Date(publishedDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'sourced in the future (?)';
  if (days < 31) return `sourced ${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `sourced ${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `sourced ${years} year${years === 1 ? '' : 's'} ago`;
}

export interface ProjectItemViewProps {
  projectId: string;
  passcode: string;
  testMode: boolean;
  item: ProjectItem;
  rubrics: Rubric[];
  allItems: ProjectItem[];
  onBack: () => void;
  onNavigate: (itemId: string) => void;
  onSeek?: (ms: number) => void;
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
  onScorePatched: ProjectItemViewProps['onScorePatched'];
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

/**
 * The Project tab's "open one detail" state — renders IN PLACE of the items
 * table inside the workspace's left panel (see ProjectPanel.tsx), never as a
 * modal/popup. Matches the wireframe: the detail content and the "Research
 * agent" chat sit side by side as one panel, with Previous/Next nav and a
 * "load another detail" dropdown, and the video/scrubber on the right of the
 * workspace stay visible and in sync (onSeek) the whole time — this is a
 * workspace view, not a dialog you have to close to keep working.
 */
export function ProjectItemView({
  projectId,
  passcode,
  testMode,
  item,
  rubrics,
  allItems,
  onBack,
  onNavigate,
  onSeek,
  onScorePatched,
}: ProjectItemViewProps) {
  const index = allItems.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? allItems[index - 1] : undefined;
  const next = index >= 0 && index < allItems.length - 1 ? allItems[index + 1] : undefined;

  // Keep the video scrubbed to whichever item is open, same as DetailsTable's
  // row-click behavior — parity with the rest of the Film workspace.
  useEffect(() => {
    onSeek?.(item.startMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className="project-item-view">
      <div className="project-item-view__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Back to table
        </button>
        <p className="project-item-view__title">
          {formatClock(item.startMs)}–{formatClock(item.endMs)}
        </p>
        <div className="project-item-view__nav">
          <button type="button" className="btn" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
            ← Previous
          </button>
          <button type="button" className="btn" disabled={!next} onClick={() => next && onNavigate(next.id)}>
            Next →
          </button>
          {allItems.length > 1 && (
            <select value={item.id} onChange={(e) => onNavigate(e.target.value)} aria-label="Load another detail">
              {allItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {formatClock(i.startMs)} — {i.subtitleText.slice(0, 40) || '(visual only)'}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="project-item-view__body">
        <div className="project-item-view__detail">
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

          {item.trendSuggestions?.map((t, ti) => (
            <div className="replacement-card trend-suggestion-card" key={ti}>
              <p className="replacement-card__label">Trend-Sourced Alternative</p>
              <p className="replacement-card__text">{t.text}</p>
              <p className="replacement-card__why">{t.justification}</p>
              <p className="replacement-card__why">
                <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
                  {t.sourceTitle}
                </a>
                {' — '}
                {describeAge(t.publishedDate)}
              </p>
            </div>
          ))}

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
        </div>

        <div className="project-item-view__chat">
          <ResearchChatPanel projectId={projectId} passcode={passcode} testMode={testMode} itemId={item.id} />
        </div>
      </div>
    </div>
  );
}
