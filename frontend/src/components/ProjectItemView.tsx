import { useEffect, useState } from 'react';
import type { ProjectItem, Rubric } from '../api/apiClient.types';
import { runTrendResearch, updateItemScore } from '../api/projectsApiClient';
import { formatClock } from '../utils/timeFormat';
import { ResearchChatPanel } from './ResearchChatPanel';
import { SparkleIcon } from './icons';

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

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const CHAT_OPEN_STORAGE_KEY = 'projectItemView.chatOpen';

function readStoredChatOpen(): boolean {
  try {
    return window.localStorage.getItem(CHAT_OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function ScoreBlock({
  index,
  rubric,
  item,
  projectId,
  passcode,
  onScorePatched,
}: {
  index: number;
  rubric: Rubric;
  item: ProjectItem;
  projectId: string;
  passcode: string;
  onScorePatched: ProjectItemViewProps['onScorePatched'];
}) {
  const existing = item.scores.find((s) => s.rubricId === rubric.id);
  const [expanded, setExpanded] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(existing?.score ?? 0);
  const [reasoning, setReasoning] = useState(existing?.reasoning ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showDescription) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowDescription(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDescription]);

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
        <span className="finding-card__index">{index + 1}</span>
        <p className="finding-card__rubric">
          {rubric.name}
          <button
            type="button"
            className="icon-btn"
            title="View rubric description"
            aria-label={`View rubric description for ${rubric.name}`}
            onClick={() => setShowDescription(true)}
          >
            <SearchIcon />
          </button>
        </p>
        {existing && (
          <span className={`score-circle score-circle--${tier}`}>
            <span className="score-circle__value">{existing.score}</span>
            <span className="score-circle__max">/10</span>
          </span>
        )}
      </div>

      <button
        type="button"
        className="finding-card__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded &&
        (!editing ? (
          <>
            <p className="finding-card__text">{existing?.reasoning || <em>Not yet scored.</em>}</p>
            {existing?.evidence && (
              <p className="finding-card__text">
                <strong>Evidence: </strong>
                {existing.evidence}
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
            {existing?.userNote && (
              <p className="finding-card__text">
                <strong>Note: </strong>
                {existing.userNote}
              </p>
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
        ))}

      {showDescription && (
        <div className="modal-backdrop" onClick={() => setShowDescription(false)}>
          <div className="modal rubric-description-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <p className="modal__title">{rubric.name}</p>
              <button type="button" className="modal__close" onClick={() => setShowDescription(false)}>
                ×
              </button>
            </div>
            <p className="finding-card__text">{rubric.description || <em>No description provided.</em>}</p>
            <p className="finding-card__text results-placeholder">
              Weight {rubric.weight}
              {rubric.trendEligible ? ' · Trend-eligible' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Manual, per-item, ungated trigger — the click itself is the trigger, so unlike a
 * bulk research run there's no shouldTranscreate/score gating here. Only rendered by
 * the parent when the project has at least one trend-eligible rubric configured. */
function TrendResearchButton({
  projectId,
  passcode,
  testMode,
  item,
  onScorePatched,
}: {
  projectId: string;
  passcode: string;
  testMode: boolean;
  item: ProjectItem;
  onScorePatched: ProjectItemViewProps['onScorePatched'];
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const updated = await runTrendResearch(projectId, item.id, { passcode, testMode });
      onScorePatched(item.id, updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find a trend-sourced alternative.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="field">
      <button type="button" className="btn" onClick={run} disabled={running}>
        {running ? 'Searching…' : 'Find Trend-Sourced Alternative'}
      </button>
      {error && <p className="passcode-gate__error">{error}</p>}
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

  const [chatOpen, setChatOpen] = useState(readStoredChatOpen);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_OPEN_STORAGE_KEY, chatOpen ? '1' : '0');
    } catch {
      // ignore
    }
  }, [chatOpen]);

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
          <button
            type="button"
            className={`chat-toggle-btn${chatOpen ? ' chat-toggle-btn--active' : ''}`}
            title={chatOpen ? 'Close research agent' : 'Open research agent'}
            aria-label={chatOpen ? 'Close research agent' : 'Open research agent'}
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((v) => !v)}
          >
            <SparkleIcon width={16} height={16} />
            Agents
          </button>
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

          {rubrics.some((r) => r.trendEligible) && (
            <TrendResearchButton
              projectId={projectId}
              passcode={passcode}
              testMode={testMode}
              item={item}
              onScorePatched={onScorePatched}
            />
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

          {rubrics.map((rubric, index) => (
            <ScoreBlock
              key={rubric.id}
              index={index}
              rubric={rubric}
              item={item}
              projectId={projectId}
              passcode={passcode}
              onScorePatched={onScorePatched}
            />
          ))}
        </div>

        <div className={`project-item-view__chat${chatOpen ? ' project-item-view__chat--open' : ''}`}>
          <ResearchChatPanel projectId={projectId} passcode={passcode} testMode={testMode} itemId={item.id} />
        </div>
      </div>
    </div>
  );
}
