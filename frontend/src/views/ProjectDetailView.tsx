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
      <div className="view-header">
        <div>
          <p className="panel-label" style={{ marginBottom: 4 }}>
            Project — {currentProject.name}
          </p>
          <p className="app-tagline">
            {currentProject.items.length} detail{currentProject.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleStartResearch}
          disabled={researchStatus === 'streaming'}
        >
          {researchStatus === 'streaming' ? 'Researching…' : 'Start Research'}
        </button>
      </div>

      {researchStatus === 'streaming' && (
        <p className="results-status" role="status">
          Batch {(batchProgress?.batchIndex ?? -1) + 1} / {totalBatches} done
        </p>
      )}
      {researchStatus === 'error' && errorMessage && <p className="passcode-gate__error">{errorMessage}</p>}

      <ul className="results-list item-list">
        {currentProject.items.map((item) => {
          const result = itemResults[item.id];
          const status = result ? 'done' : 'pending';
          const isExpanded = expandedId === item.id;

          return (
            <li className="result-card" key={item.id}>
              <button
                type="button"
                className="item-row__toggle"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                aria-expanded={isExpanded}
              >
                <div className="item-row__body">
                  <div className="result-card__row result-card__row--line">
                    <span className="result-card__key">Line</span>
                    <span className="result-card__value">
                      {item.scriptLine || <em>(visual only)</em>}
                    </span>
                  </div>
                  <div className="result-card__row">
                    <span className="result-card__key">Scene</span>
                    <span className="result-card__value">{item.sceneDescription}</span>
                  </div>
                </div>
                <div className="item-row__badges">
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
                      <div className="result-card__row">
                        <span className="result-card__key">Suggested</span>
                        <span className="result-card__value">{result.suggestedReplacement.text}</span>
                      </div>
                      <div className="result-card__row">
                        <span className="result-card__key">Why</span>
                        <span className="result-card__value">{result.suggestedReplacement.justification}</span>
                      </div>
                    </div>
                  )}

                  {result &&
                    result.scores.map((s) => {
                      const rubric = rubricsById[s.rubricId];
                      const tier = s.score >= 7 ? 'high' : s.score >= 4 ? 'mid' : 'low';
                      return (
                        <div className="finding-card" key={s.rubricId}>
                          <div className="result-card__row">
                            <span className="result-card__key">Rubric</span>
                            <span className="result-card__value">{rubric?.description ?? s.rubricId}</span>
                          </div>
                          <div className="result-card__row">
                            <span className="result-card__key">Score</span>
                            <span className={`score-value score-value--${tier}`}>{s.score} / 10</span>
                          </div>
                          <div className="result-card__row">
                            <span className="result-card__key">Reasoning</span>
                            <span className="result-card__value">{s.reasoning}</span>
                          </div>
                          <div className="result-card__row">
                            <span className="result-card__key">Evidence</span>
                            <span className="result-card__value">{s.evidence}</span>
                          </div>
                          {s.sources.length > 0 && (
                            <div className="result-card__row">
                              <span className="result-card__key">Sources</span>
                              <span className="result-card__value source-list">
                                {s.sources.map((src, si) => (
                                  <a key={si} href={src} target="_blank" rel="noreferrer" className="source-link">
                                    {src}
                                  </a>
                                ))}
                              </span>
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
