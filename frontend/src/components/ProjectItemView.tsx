import { useEffect, useRef, useState } from 'react';
import type { ProjectItem, ProjectItemAction, Rubric } from '../api/apiClient.types';
import { runTrendResearch, updateItem, updateItemScore } from '../api/projectsApiClient';
import { formatClock } from '../utils/timeFormat';
import { ResearchChatPanel } from './ResearchChatPanel';
import { SparkleIcon } from './icons';

const ACTIONS: ProjectItemAction[] = ['pending', 'accepted', 'rejected', 'need-research'];

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

function scoreTier(score: number): 'low' | 'mid' | 'high' {
  return score >= 7 ? 'high' : score >= 4 ? 'mid' : 'low';
}

/** Fires a caller-provided flash of "Saved" for a couple seconds — shared by every
 * autosave-on-blur field below instead of each one re-implementing its own timer. */
function useSavedFlash(durationMs = 2000) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function flash() {
    setSaved(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSaved(false), durationMs);
  }

  return [saved, flash] as const;
}

/**
 * A plain-prose textarea that saves itself on blur — no Save button, matching
 * the note-taking flow the wireframe called for, generalized to every AI-written
 * field a human can now correct here (this is a shared workspace, not a
 * one-way AI report). Won't clobber an in-progress edit if the underlying
 * value changes from elsewhere (e.g. a chat agent) while the field is focused.
 */
function AutosaveTextarea({
  value,
  onSave,
  placeholder,
  className = 'editable-text',
  rows = 2,
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const [local, setLocal] = useState(value);
  const [saved, flash] = useSavedFlash();
  const focusedRef = useRef(false);
  const lastSavedRef = useRef(value);

  useEffect(() => {
    if (!focusedRef.current) setLocal(value);
    lastSavedRef.current = value;
  }, [value]);

  async function handleBlur() {
    focusedRef.current = false;
    if (local === lastSavedRef.current) return;
    lastSavedRef.current = local;
    await onSave(local);
    flash();
  }

  return (
    <div className="autosave-row">
      <textarea
        className={className}
        rows={rows}
        value={local}
        placeholder={placeholder}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
      />
      {saved && <span className="autosave-flash">Saved</span>}
    </div>
  );
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
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(existing?.score ?? 0);
  const [reasoning, setReasoning] = useState(existing?.reasoning ?? '');
  const [evidence, setEvidence] = useState(existing?.evidence ?? '');
  const [sourcesText, setSourcesText] = useState((existing?.sources ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setScore(existing?.score ?? 0);
    setReasoning(existing?.reasoning ?? '');
    setEvidence(existing?.evidence ?? '');
    setSourcesText((existing?.sources ?? []).join('\n'));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const sources = sourcesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateItemScore(projectId, item.id, rubric.id, { passcode, score, reasoning, evidence, sources });
      onScorePatched(item.id, updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(next: string) {
    const updated = await updateItemScore(projectId, item.id, rubric.id, { passcode, userNote: next });
    onScorePatched(item.id, updated);
  }

  return (
    <div className="finding-card">
      <div className="finding-card__top">
        <span className="finding-card__index">{index + 1}</span>
        <p className="finding-card__rubric">
          {rubric.name}
          <span className="finding-card__weight">weight {rubric.weight}</span>
        </p>
        {existing ? (
          <span className={`score-circle score-circle--${scoreTier(existing.score)}`}>
            <span className="score-circle__value">{existing.score}</span>
            <span className="score-circle__max">/10</span>
          </span>
        ) : (
          <span className="score-circle score-circle--none">
            <span className="score-circle__value">—</span>
          </span>
        )}
      </div>

      <p className="finding-card__text">{existing?.reasoning || <em>Not yet scored.</em>}</p>

      <button type="button" className="finding-card__toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded &&
        (!editing ? (
          <>
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
            <button type="button" className="btn" onClick={startEditing}>
              Edit score
            </button>

            <div className="field">
              <label>Your note</label>
              <AutosaveTextarea value={existing?.userNote ?? ''} placeholder="Add a private note for this rubric…" onSave={saveNote} />
            </div>

            <div className="field">
              <label>About this rubric</label>
              <p className="finding-card__text results-placeholder">
                {rubric.description || <em>No description provided.</em>}
                {' · Weight '}
                {rubric.weight}
                {rubric.trendEligible ? ' · Trend-eligible' : ''}
              </p>
            </div>
          </>
        ) : (
          <div className="field">
            <label>Score (0-10)</label>
            <input type="number" min={0} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} />
            <label>Reasoning</label>
            <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} />
            <label>Evidence</label>
            <textarea className="field__textarea--compact" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <label>Sources (one URL per line)</label>
            <textarea className="field__textarea--compact" value={sourcesText} onChange={(e) => setSourcesText(e.target.value)} />
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
  onActionChange: (itemId: string, action: ProjectItemAction) => void;
}

/**
 * The Project tab's "open one detail" state — renders IN PLACE of the items
 * table inside the workspace's left panel (see ProjectPanel.tsx), never as a
 * modal/popup. This is a shared workspace: subtitle/scene-description/custom
 * columns come straight from the film and stay read-only, but everything the
 * AI wrote — the verdict, the executive reason, the suggested replacement,
 * every rubric score — is exactly as correctable by a human here as a rubric
 * score already was, plus the human's own accept/reject verdict, which used
 * to only be editable back in the table.
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
  onActionChange,
}: ProjectItemViewProps) {
  const index = allItems.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? allItems[index - 1] : undefined;
  const next = index >= 0 && index < allItems.length - 1 ? allItems[index + 1] : undefined;

  const [chatOpen, setChatOpen] = useState(false);

  // Keep the video scrubbed to whichever item is open, same as DetailsTable's
  // row-click behavior — parity with the rest of the Film workspace.
  useEffect(() => {
    onSeek?.(item.startMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function saveShouldTranscreate(next: boolean) {
    const updated = await updateItem(projectId, item.id, { passcode, shouldTranscreate: next });
    onScorePatched(item.id, updated);
  }

  async function saveSummary(next: string) {
    const updated = await updateItem(projectId, item.id, { passcode, summary: next || null });
    onScorePatched(item.id, updated);
  }

  async function saveReplacement(patch: Partial<{ text: string; justification: string }>) {
    const current = item.suggestedReplacement ?? { text: '', justification: '' };
    const updated = await updateItem(projectId, item.id, { passcode, suggestedReplacement: { ...current, ...patch } });
    onScorePatched(item.id, updated);
  }

  // Ranked, not just listed — the biggest driver of the score leads, matching
  // how a reviewer actually wants to triage: worst offenders first. Unscored
  // rubrics (no entry in item.scores yet) sort to the bottom.
  const rankedRubrics = [...rubrics].sort((a, b) => {
    const scoreA = item.scores.find((s) => s.rubricId === a.id)?.score ?? -1;
    const scoreB = item.scores.find((s) => s.rubricId === b.id)?.score ?? -1;
    return scoreB - scoreA;
  });

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
            <select className="nav-select" value={item.id} onChange={(e) => onNavigate(e.target.value)} aria-label="Load another detail">
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
          <div className="overview-card">
            <div className="overview-card__top">
              <div className="overview-card__context">
                <div className="field">
                  <label>Subtitle</label>
                  <p>{item.subtitleText || <em>Visual only</em>}</p>
                </div>
                <div className="field">
                  <label>Scene / segment description</label>
                  <p>{item.sceneDescription}</p>
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
                <span
                  className={`score-circle score-circle--lg ${item.importanceScore == null ? 'score-circle--none' : `score-circle--${scoreTier(item.importanceScore)}`}`}
                >
                  <span className="score-circle__value">{item.importanceScore ?? '—'}</span>
                  {item.importanceScore != null && <span className="score-circle__max">/10</span>}
                </span>
                <p className="finding-card__weight" style={{ marginTop: 4 }}>
                  importance
                </p>
              </div>
            </div>

            <div className="overview-card__section">
              <div className="verdict-toggle">
                <button
                  type="button"
                  className={`verdict-toggle__option${item.shouldTranscreate === false ? ' verdict-toggle__option--active-no-change' : ''}`}
                  onClick={() => saveShouldTranscreate(false)}
                >
                  Fine As-Is
                </button>
                <button
                  type="button"
                  className={`verdict-toggle__option${item.shouldTranscreate === true ? ' verdict-toggle__option--active-change' : ''}`}
                  onClick={() => saveShouldTranscreate(true)}
                >
                  Needs Change
                </button>
              </div>
              <div className="field">
                <label>Executive reason</label>
                <AutosaveTextarea
                  value={item.summary ?? ''}
                  placeholder="Why does — or doesn't — this line need a change?"
                  onSave={saveSummary}
                />
              </div>
            </div>

            <div className="overview-card__section">
              <div className="field">
                <label>Your verdict</label>
                <div className="verdict-picker">
                  {ACTIONS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`verdict-picker__option${item.action === a ? ` verdict-picker__option--active-${a}` : ''}`}
                      onClick={() => onActionChange(item.id, a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {item.shouldTranscreate && (
              <div className="replacement-card">
                <p className="replacement-card__label">Suggested replacement</p>
                <AutosaveTextarea
                  value={item.suggestedReplacement?.text ?? ''}
                  placeholder="Propose replacement text…"
                  onSave={(v) => saveReplacement({ text: v })}
                  className="editable-text replacement-card__text"
                />
                <AutosaveTextarea
                  value={item.suggestedReplacement?.justification ?? ''}
                  placeholder="Why this replacement?"
                  onSave={(v) => saveReplacement({ justification: v })}
                  className="editable-text replacement-card__why"
                />
              </div>
            )}

            {rubrics.some((r) => r.trendEligible) && (
              <TrendResearchButton projectId={projectId} passcode={passcode} testMode={testMode} item={item} onScorePatched={onScorePatched} />
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
          </div>

          {rankedRubrics.map((rubric, i) => (
            <ScoreBlock key={rubric.id} index={i} rubric={rubric} item={item} projectId={projectId} passcode={passcode} onScorePatched={onScorePatched} />
          ))}
        </div>

        <div className={`project-item-view__chat${chatOpen ? ' project-item-view__chat--open' : ''}`}>
          <ResearchChatPanel projectId={projectId} passcode={passcode} testMode={testMode} itemId={item.id} items={allItems} />
        </div>
      </div>
    </div>
  );
}
