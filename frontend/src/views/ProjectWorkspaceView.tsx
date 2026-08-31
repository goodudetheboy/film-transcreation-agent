import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getProject,
  listRubrics,
  listItems,
  addItems,
  updateItemAction,
  createRubric,
  updateRubric,
  deleteRubric,
  streamResearchRun,
} from '../api/projectsApiClient';
import { listDetails } from '../api/filmsApiClient';
import type { DetailRow, ProjectItem, ProjectItemAction } from '../api/apiClient.types';
import { useProjectWorkspaceStore, type ProjectItemFilter } from '../store/projectWorkspaceStore';
import { formatClock } from '../utils/timeFormat';
import { DetailRowPicker } from '../components/DetailRowPicker';
import { RubricsEditor } from '../components/RubricsEditor';
import { ResearchKickoffPanel } from '../components/ResearchKickoffPanel';
import { DetailExpansionPanel } from '../components/DetailExpansionPanel';

export interface ProjectWorkspaceViewProps {
  passcode: string;
  testMode: boolean;
}

const FILTERS: ProjectItemFilter[] = ['all', 'accepted', 'pending', 'rejected', 'need-research'];
const ACTIONS: ProjectItemAction[] = ['pending', 'accepted', 'rejected', 'need-research'];

export function ProjectWorkspaceView({ passcode, testMode }: ProjectWorkspaceViewProps) {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'items' | 'rubrics'>('items');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filmRows, setFilmRows] = useState<DetailRow[]>([]);
  const [showAddDetails, setShowAddDetails] = useState(false);
  const [addSelection, setAddSelection] = useState<Set<string>>(new Set());
  const [showKickoff, setShowKickoff] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const {
    project,
    rubrics,
    items,
    runStatus,
    filter,
    sortBy,
    setProject,
    setRubrics,
    addRubric,
    updateRubricInPlace,
    removeRubric,
    setItems,
    addItems: addItemsToStore,
    patchItem,
    startRun,
    applyRunEvent,
    setFilter,
    setSort,
    reset,
  } = useProjectWorkspaceStore();

  useEffect(() => {
    reset();
    setLoadError(null);
    if (!id) return;
    let cancelled = false;
    Promise.all([getProject(id, passcode), listRubrics(id, passcode), listItems(id, passcode)])
      .then(([p, r, i]) => {
        if (cancelled) return;
        setProject(p);
        setRubrics(r);
        setItems(i);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load project');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!project?.sourceFilmId) return;
    listDetails(project.sourceFilmId, passcode).then((d) => setFilmRows(d.rows));
  }, [project?.sourceFilmId, passcode]);

  const allItems = Object.values(items);
  const filtered = filter === 'all' ? allItems : allItems.filter((i) => i.action === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'startMs') return a.startMs - b.startMs;
    return (b.importanceScore ?? -1) - (a.importanceScore ?? -1);
  });

  async function handleActionChange(itemId: string, action: ProjectItemAction) {
    patchItem(itemId, { action });
    if (id) await updateItemAction(id, itemId, { passcode, action });
  }

  async function handleAddDetails() {
    if (!id || addSelection.size === 0) return;
    const added = await addItems(id, { passcode, detailRowIds: [...addSelection] });
    addItemsToStore(added);
    setAddSelection(new Set());
    setShowAddDetails(false);
  }

  async function handleKickoff(input: { mode: 'need-research' | 'custom'; itemIds?: string[]; testMode: boolean }) {
    if (!id) return;
    startRun('pending');
    await streamResearchRun(id, { passcode, testMode: input.testMode, mode: input.mode, itemIds: input.itemIds }, (event) => {
      applyRunEvent(event);
      if (event.type === 'done' && id) {
        // Re-fetch to pick up server-computed importanceScore, not carried on the SSE event.
        listItems(id, passcode).then(setItems);
      }
    });
  }

  async function handleAddRubric() {
    if (!id) return;
    const rubric = await createRubric(id, { passcode, name: '', description: '', weight: 3 });
    addRubric(rubric);
  }

  const alreadyImportedIds = new Set(allItems.map((i) => i.detailRowId));
  const openItem = openItemId ? items[openItemId] : null;

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!project) return <p className="results-placeholder">Loading…</p>;

  return (
    <div className="app-body-inner">
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">{project.name}</h1>
          <p className="page-header__subtitle">{project.country}</p>
        </div>
        <div className="page-header__actions">
          <span className={`status-badge status-badge--${project.status}`}>{project.status}</span>
          <button type="button" className="btn" onClick={() => setShowAddDetails(true)}>
            + Manually add details
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setShowKickoff(true)} disabled={runStatus === 'streaming'}>
            {runStatus === 'streaming' ? 'Researching…' : '✨ Kick off agentic research'}
          </button>
        </div>
      </div>

      <nav className="workspace-tabs">
        <button type="button" className={`workspace-tabs__tab${tab === 'items' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('items')}>
          Items
        </button>
        <button type="button" className={`workspace-tabs__tab${tab === 'rubrics' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('rubrics')}>
          Rubrics
        </button>
      </nav>

      {tab === 'items' && (
        <>
          <nav className="workspace-tabs">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`workspace-tabs__tab${filter === f ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </nav>

          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="sort-by">Sort by</label>
            <select id="sort-by" value={sortBy} onChange={(e) => setSort(e.target.value as 'importanceScore' | 'startMs')}>
              <option value="importanceScore">Importance (high → low)</option>
              <option value="startMs">Time in film</option>
            </select>
          </div>

          {sorted.length === 0 && <p className="results-placeholder">No items match this filter.</p>}

          {sorted.length > 0 && (
            <div className="details-table-wrap">
              <div className="details-table-scroll">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Subtitle</th>
                      <th>Importance</th>
                      <th>Verdict</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((item) => (
                      <tr key={item.id} className={`details-table__row--${item.action}`} onClick={() => setOpenItemId(item.id)}>
                        <td className="details-table__cell--nowrap-exempt">{formatClock(item.startMs)}</td>
                        <td>{item.subtitleText || <em>Visual only</em>}</td>
                        <td>{item.importanceScore ?? <span className="results-placeholder">—</span>}</td>
                        <td>
                          {item.summary ? (
                            <span className={`verdict-badge verdict-badge--${item.shouldTranscreate ? 'change' : 'no-change'}`}>
                              {item.shouldTranscreate ? 'needs change' : 'fine as-is'}
                            </span>
                          ) : (
                            <span className="results-placeholder">not researched</span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="action-picker"
                            value={item.action}
                            onChange={(e) => handleActionChange(item.id, e.target.value as ProjectItemAction)}
                          >
                            {ACTIONS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'rubrics' && (
        <RubricsEditor
          rubrics={rubrics}
          onAdd={handleAddRubric}
          onChange={async (i, patch) => {
            const rubric = rubrics[i];
            if (!id || !rubric.id) return;
            const updated = await updateRubric(id, rubric.id, { passcode, ...patch });
            updateRubricInPlace(updated);
          }}
          onRemove={async (i) => {
            const rubric = rubrics[i];
            if (!id || !rubric.id) return;
            await deleteRubric(id, rubric.id, passcode);
            removeRubric(rubric.id);
          }}
        />
      )}

      {showAddDetails && (
        <div className="modal-backdrop" onClick={() => setShowAddDetails(false)}>
          <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <p className="modal__title">+ Manually add details</p>
              <button type="button" className="modal__close" onClick={() => setShowAddDetails(false)}>
                ×
              </button>
            </div>
            <DetailRowPicker
              rows={filmRows}
              selected={addSelection}
              onToggle={(rowId) =>
                setAddSelection((prev) => {
                  const next = new Set(prev);
                  if (next.has(rowId)) next.delete(rowId);
                  else next.add(rowId);
                  return next;
                })
              }
              alreadyImportedIds={alreadyImportedIds}
            />
            <button type="button" className="btn btn--primary" onClick={handleAddDetails} disabled={addSelection.size === 0}>
              Add {addSelection.size || ''} detail{addSelection.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {showKickoff && (
        <ResearchKickoffPanel items={allItems} testMode={testMode} onKickoff={handleKickoff} onClose={() => setShowKickoff(false)} />
      )}

      {openItem && (
        <DetailExpansionPanel
          projectId={project.id}
          passcode={passcode}
          testMode={testMode}
          item={openItem}
          rubrics={rubrics}
          allItems={sorted}
          onClose={() => setOpenItemId(null)}
          onNavigate={setOpenItemId}
          onScorePatched={(itemId, patch) => patchItem(itemId, patch as Partial<ProjectItem>)}
        />
      )}
    </div>
  );
}
