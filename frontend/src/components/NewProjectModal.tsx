import { useEffect, useState } from 'react';
import { getFilm, listDetails, createProjectFromFilm } from '../api/filmsApiClient';
import { streamResearchRun } from '../api/projectsApiClient';
import type { DetailRow, Film, Project } from '../api/apiClient.types';
import { DetailRowPicker } from './DetailRowPicker';
import { RubricsEditor, type DraftRubric } from './RubricsEditor';

export interface NewProjectModalProps {
  filmId: string;
  passcode: string;
  testMode: boolean;
  onCreated: (project: Project) => void;
  onClose: () => void;
}

type Step = 'info' | 'select' | 'rubrics' | 'confirm';
const STEPS: Step[] = ['info', 'select', 'rubrics', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  info: 'Project info',
  select: 'Selected details',
  rubrics: 'Rubrics',
  confirm: 'Confirmation',
};

function emptyRubric(): DraftRubric {
  return { name: '', description: '', weight: 3 };
}

/**
 * Film-first project creation, as a modal — matches the wireframe's "Add new
 * Project?" mockup (a small, tabbed dialog: Project info / Selected details /
 * Rubrics / Confirmation), not a standalone page. The film is fixed by
 * whoever opened this (the Film workspace's Project tab, or the Library after
 * picking a film) — there's no film picker here.
 */
export function NewProjectModal({ filmId, passcode, testMode, onCreated, onClose }: NewProjectModalProps) {
  const [step, setStep] = useState<Step>('info');
  const [film, setFilm] = useState<Film | null>(null);
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [country, setCountry] = useState('');
  const [note, setNote] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [rubrics, setRubrics] = useState<DraftRubric[]>([]);
  const [kickOffFirstPass, setKickOffFirstPass] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFilm(filmId, passcode), listDetails(filmId, passcode)])
      .then(([f, details]) => {
        if (cancelled) return;
        setFilm(f);
        setRows(details.rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load film');
      });
    return () => {
      cancelled = true;
    };
  }, [filmId, passcode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  function toggleRow(rowId: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function goNext() {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  }
  function goBack() {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  }

  const canProceedFromInfo = country.trim() !== '';
  const canProceedFromSelect = selectedRowIds.size > 0;

  async function handleFinish() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const validRubrics = rubrics.filter((r) => r.name.trim() !== '' && r.description.trim() !== '');
      const { project, items } = await createProjectFromFilm(filmId, {
        passcode,
        country,
        note: note.trim() || undefined,
        detailRowIds: [...selectedRowIds],
        rubrics: validRubrics.length > 0 ? validRubrics : undefined,
      });

      if (kickOffFirstPass && items.length > 0) {
        // Fire-and-forget: the workspace panel picks up live progress via the
        // resumable research-runs stream once it mounts for this project.
        void streamResearchRun(
          project.id,
          { passcode, testMode, mode: 'custom', itemIds: items.map((i) => i.id) },
          () => {},
        );
      }

      onCreated(project);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'failed to create project');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="modal new-project-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">Add new Project{film ? ` — ${film.title}` : ''}</p>
          <button type="button" className="modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </div>

        {loadError && <p className="passcode-gate__error">{loadError}</p>}
        {!loadError && !film && <p className="results-placeholder">Loading…</p>}

        {film && (
          <>
            <nav className="workspace-tabs">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`workspace-tabs__tab${step === s ? ' workspace-tabs__tab--active' : ''}`}
                  onClick={() => setStep(s)}
                >
                  {STEP_LABELS[s]}
                </button>
              ))}
            </nav>

            {step === 'info' && (
              <div className="new-project-form">
                <div className="field">
                  <label htmlFor="country">Target country</label>
                  <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="note">Note (optional)</label>
                  <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button type="button" className="btn btn--primary" disabled={!canProceedFromInfo} onClick={goNext}>
                  Next
                </button>
              </div>
            )}

            {step === 'select' && (
              <div className="new-project-form">
                <p className="hint-text">
                  This is where the details table is listed as a whole — select which rows to import into this
                  project. Only what&rsquo;s selected here gets fed to the research agent.
                </p>
                <DetailRowPicker rows={rows} selected={selectedRowIds} onToggle={toggleRow} />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn" onClick={goBack}>
                    Back
                  </button>
                  <button type="button" className="btn btn--primary" disabled={!canProceedFromSelect} onClick={goNext}>
                    Next ({selectedRowIds.size} selected)
                  </button>
                </div>
              </div>
            )}

            {step === 'rubrics' && (
              <div className="new-project-form">
                <p className="hint-text">
                  Configure your set of rubrics and requirements for the research agent so it can best maximize
                  research results. Each detail is scored against these rubrics, combined with the importance weight
                  you give it. Parallel is used underneath for information grounding and discovery. Leave this empty
                  to use the default rubric set.
                </p>
                <RubricsEditor
                  rubrics={rubrics}
                  onAdd={() => setRubrics((prev) => [...prev, emptyRubric()])}
                  onChange={(i, patch) => setRubrics((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))}
                  onRemove={(i) => setRubrics((prev) => prev.filter((_, idx) => idx !== i))}
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn" onClick={goBack}>
                    Back
                  </button>
                  <button type="button" className="btn btn--primary" onClick={goNext}>
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="new-project-form">
                <ul className="content-list">
                  <li className="content-card">
                    <p className="content-card__primary">{country || <em>No country set</em>}</p>
                    <p className="content-card__secondary">{film.title}</p>
                    <p className="content-card__caption">
                      {selectedRowIds.size} detail{selectedRowIds.size === 1 ? '' : 's'} ·{' '}
                      {rubrics.filter((r) => r.name.trim() !== '').length || 'default'} rubric
                      {rubrics.filter((r) => r.name.trim() !== '').length === 1 ? '' : 's'}
                    </p>
                  </li>
                </ul>
                <label className="checkbox-field">
                  <input type="checkbox" checked={kickOffFirstPass} onChange={(e) => setKickOffFirstPass(e.target.checked)} />
                  Kick off agentic research on project creation?
                </label>

                {submitError && <p className="passcode-gate__error">{submitError}</p>}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn" onClick={goBack} disabled={submitting}>
                    Back
                  </button>
                  <button type="button" className="btn btn--primary" onClick={handleFinish} disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create project'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
