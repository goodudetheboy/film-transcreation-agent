import { useEffect, useState } from 'react';
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

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!currentProject) return <p className="results-placeholder">Loading…</p>;

  const totalBatches = batchProgress?.totalBatches ?? Math.ceil(currentProject.items.length / 10);

  return (
    <div className="app-body-inner">
      <div className="view-header">
        <div>
          <p className="panel-label" style={{ marginBottom: 4 }}>
            Project — {currentProject.country}
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
                <span className={`status-badge status-badge--${status}`}>{status}</span>
              </button>

              {isExpanded && (
                <div className="item-findings">
                  {!result && <p className="results-placeholder">Not yet researched.</p>}
                  {result && result.findings.length === 0 && (
                    <p className="results-placeholder">No rubric concerns found.</p>
                  )}
                  {result &&
                    result.findings.map((f, i) => (
                      <div className="finding-card" key={i}>
                        <div className="result-card__row">
                          <span className="result-card__key">Rubric</span>
                          <span className="result-card__value">{f.rubricId}</span>
                        </div>
                        <div className="result-card__row">
                          <span className="result-card__key">Reason</span>
                          <span className="result-card__value">{f.reasonToChange}</span>
                        </div>
                        <div className="result-card__row">
                          <span className="result-card__key">Evidence</span>
                          <span className="result-card__value">{f.evidence}</span>
                        </div>
                        <div className="result-card__row">
                          <span className="result-card__key">Direction</span>
                          <span className="result-card__value">{f.changeDirection}</span>
                        </div>
                        {f.sources.length > 0 && (
                          <div className="result-card__row">
                            <span className="result-card__key">Sources</span>
                            <span className="result-card__value source-list">
                              {f.sources.map((s, si) => (
                                <a key={si} href={s} target="_blank" rel="noreferrer" className="source-link">
                                  {s}
                                </a>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
