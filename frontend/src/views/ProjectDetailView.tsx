import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProject, streamResearch } from '../api/projectsApiClient';
import { useProjectStore } from '../store/projectStore';

export interface ProjectDetailViewProps {
  passcode: string;
  testMode: boolean;
}

export function ProjectDetailView({ passcode, testMode }: ProjectDetailViewProps) {
  const { id } = useParams<{ id: string }>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    currentProject,
    researchStatus,
    batchProgress,
    itemResults,
    errorMessage,
    setCurrentProject,
    startResearch,
    applyEvent,
    reset,
  } = useProjectStore();

  useEffect(() => {
    reset();
    setLoadError(null);
    if (!id) return;

    let cancelled = false;
    getProject(id, passcode)
      .then((p) => {
        if (!cancelled) setCurrentProject(p);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load project');
      });
    return () => {
      cancelled = true;
    };
    // Intentionally re-runs only when the route id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStartResearch() {
    if (!id) return;
    startResearch();
    await streamResearch(id, { passcode, testMode }, (event) => applyEvent(event));
  }

  const rubricsById = useMemo(
    () => Object.fromEntries((currentProject?.rubrics ?? []).map((r) => [r.id, r])),
    [currentProject?.rubrics],
  );

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!currentProject) return <p className="results-placeholder">Loading…</p>;

  const totalBatches = batchProgress?.totalBatches ?? Math.ceil(currentProject.items.length / 10);

  return (
    <div className="app-body-inner">
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">Project — {currentProject.name}</h1>
          <p className="page-header__subtitle">
            {currentProject.items.length} detail{currentProject.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="page-header__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleStartResearch}
            disabled={researchStatus === 'streaming'}
          >
            {researchStatus === 'streaming' ? 'Researching…' : 'Start Research'}
          </button>
        </div>
      </div>

      {researchStatus === 'streaming' && (
        <p className="results-status" role="status">
          Batch {(batchProgress?.batchIndex ?? -1) + 1} / {totalBatches} done
        </p>
      )}
      {researchStatus === 'error' && errorMessage && <p className="passcode-gate__error">{errorMessage}</p>}

      <ul className="content-list">
        {currentProject.items.map((item) => {
          const result = itemResults[item.id];
          const status = result ? 'done' : 'pending';
          const isExpanded = expandedId === item.id;

          return (
            <li className="content-card" key={item.id}>
              <button
                type="button"
                className="item-row__toggle"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                aria-expanded={isExpanded}
              >
                <div className="content-card__body">
                  <p className="content-card__primary">
                    {item.scriptLine ? `“${item.scriptLine}”` : <em>Visual only</em>}
                  </p>
                  <p className="content-card__secondary">{item.sceneDescription}</p>
                </div>
                <div className="content-card__badges">
                  <span className={`status-badge status-badge--${status}`}>{status}</span>
                  {result && (
                    <span
                      className={`verdict-badge verdict-badge--${result.shouldTranscreate ? 'change' : 'no-change'}`}
                    >
                      {result.shouldTranscreate ? 'needs change' : 'fine as-is'}
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="item-findings">
                  {!result && <p className="results-placeholder">Not yet researched.</p>}

                  {result && (
                    <div className="verdict-block">
                      <span
                        className={`verdict-badge verdict-badge--${result.shouldTranscreate ? 'change' : 'no-change'}`}
                      >
                        {result.shouldTranscreate ? 'Needs Change' : 'Fine As-Is'}
                      </span>
                      <p className="verdict-block__text">{result.summary}</p>
                    </div>
                  )}

                  {result?.shouldTranscreate && result.suggestedReplacement && (
                    <div className="replacement-card">
                      <p className="replacement-card__label">Suggested replacement</p>
                      <p className="replacement-card__text">{result.suggestedReplacement.text}</p>
                      <p className="replacement-card__why">{result.suggestedReplacement.justification}</p>
                    </div>
                  )}

                  {result && result.scores.length > 0 && (
                    <p className="hint-text">
                      Score reflects how strongly this line matches each rubric&rsquo;s concern —
                      higher means a stronger signal to localize.
                    </p>
                  )}
                  {result &&
                    result.scores.map((s) => {
                      const rubric = rubricsById[s.rubricId];
                      const tier = s.score >= 7 ? 'high' : s.score >= 4 ? 'mid' : 'low';
                      return (
                        <div className="finding-card" key={s.rubricId}>
                          <div className="finding-card__top">
                            <p className="finding-card__rubric">{rubric?.description ?? s.rubricId}</p>
                            <span className={`score-chip score-chip--${tier}`}>
                              {s.score}
                              <span className="score-chip__max">/10</span>
                            </span>
                          </div>
                          <p className="finding-card__text">{s.reasoning}</p>
                          <p className="finding-card__text">
                            <strong>Evidence: </strong>
                            {s.evidence}
                          </p>
                          {s.sources.length > 0 && (
                            <div className="source-list">
                              {s.sources.map((src, si) => (
                                <a key={si} href={src} target="_blank" rel="noreferrer" className="source-link">
                                  {src}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
