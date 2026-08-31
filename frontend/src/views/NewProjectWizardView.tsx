import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFilm, listDetails, createProjectFromFilm } from '../api/filmsApiClient';
import { streamResearchRun } from '../api/projectsApiClient';
import type { DetailRow, Film } from '../api/apiClient.types';
import { DetailRowPicker } from '../components/DetailRowPicker';
import { RubricsEditor, type DraftRubric } from '../components/RubricsEditor';

export interface NewProjectWizardViewProps {
  passcode: string;
  testMode: boolean;
}

type Step = 'info' | 'select' | 'rubrics' | 'confirm';
const STEPS: Step[] = ['info', 'select', 'rubrics', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  info: 'Project info',
  select: 'Select details',
  rubrics: 'Rubrics',
  confirm: 'Confirm',
};

function emptyRubric(): DraftRubric {
  return { name: '', description: '', weight: 3 };
}

/**
 * Film-first project creation. Single-file 4-step local state machine
 * (ProjectInfoStep/SelectedDetailsStep/RubricsStep/ConfirmationStep collapsed
 * into one component rather than 4 separate files — a disclosed, smallest-
 * reasonable deviation from the plan's file layout; the step boundaries and
 * behavior are unchanged). The film itself is fixed by the route
 * (:filmId) — there's no film picker here, since you always arrive at this
 * wizard already having picked a film (from its workspace or the library).
 */
export function NewProjectWizardView({ passcode, testMode }: NewProjectWizardViewProps) {
  const { filmId } = useParams<{ filmId: string }>();
  const navigate = useNavigate();

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
    if (!filmId) return;
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
    if (!filmId) return;
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
        // Fire-and-forget: the workspace view picks up live progress via the
        // resumable research-runs stream once we land there.
        void streamResearchRun(
          project.id,
          { passcode, testMode, mode: 'custom', itemIds: items.map((i) => i.id) },
          () => {},
        );
      }

      navigate(`/projects/${project.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'failed to create project');
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!film) return <p className="results-placeholder">Loading…</p>;

  return (
    <div className="app-body-inner">
      <div className="page-header__heading">
        <h1 className="page-header__title">New Project — {film.title}</h1>
      </div>

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
          <p className="hint-text">Pick which of this film&rsquo;s Details rows to bring into the project.</p>
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
            Leave this empty to use the default rubric set, or define your own. Each rubric&rsquo;s weight (1-5) controls
            how much it counts toward an item&rsquo;s overall importance score.
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
            Kick off the first research pass immediately
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
    </div>
  );
}
