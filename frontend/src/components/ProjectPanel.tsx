import { useEffect, useState } from 'react';
import {
  getProject,
  listRubrics,
  listItems,
  addItems,
  updateItemAction,
  createRubric,
  updateRubric,
  deleteRubric,
} from '../api/projectsApiClient';
import { listDetails } from '../api/filmsApiClient';
import type { DetailRow, ProjectItem, ProjectItemAction } from '../api/apiClient.types';
import { useProjectWorkspaceStore, type ProjectItemFilter } from '../store/projectWorkspaceStore';
import { formatClock } from '../utils/timeFormat';
import { DetailRowPicker } from './DetailRowPicker';
import { RubricsEditor } from './RubricsEditor';
import { ResearchChatPanel } from './ResearchChatPanel';
import { ProjectItemView } from './ProjectItemView';
import { SparkleIcon } from './icons';
import { Flag } from './Flag';
import { countryCode } from '../data/countries';

export interface ProjectPanelProps {
  projectId: string;
  passcode: string;
  testMode: boolean;
  onSeek?: (ms: number) => void;
  /** Every item's review status, keyed by its source DetailRow id, so the
   * workspace's Details track on the scrub bar can color each block by status. */
  onItemStatusByRow?: (statusByRow: Record<string, ProjectItemAction>) => void;
  onBackToProjects: () => void;
}

const FILTERS: ProjectItemFilter[] = ['all', 'accepted', 'pending', 'rejected', 'need-research'];
const ACTIONS: ProjectItemAction[] = ['pending', 'accepted', 'rejected', 'need-research'];

/**
 * The Project tab's actual content — lives INSIDE FilmWorkspaceView's left
 * panel (see FilmWorkspaceView.tsx's "project" tab), not on its own route.
 * The video/scrubber on the right of the workspace stay mounted and visible
 * the whole time, same as the Details tab — this is a workspace panel, not a
 * separate page.
 */
export function ProjectPanel({ projectId, passcode, testMode, onSeek, onItemStatusByRow, onBackToProjects }: ProjectPanelProps) {
  const [tab, setTab] = useState<'items' | 'rubrics'>('items');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filmRows, setFilmRows] = useState<DetailRow[]>([]);
  const [showAddDetails, setShowAddDetails] = useState(false);
  const [addSelection, setAddSelection] = useState<Set<string>>(new Set());
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const {
    project,
    rubrics,
    items,
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
    setFilter,
    setSort,
    reset,
  } = useProjectWorkspaceStore();

  useEffect(() => {
    reset();
    setLoadError(null);
    setOpenItemId(null);
    onItemStatusByRow?.({});
    let cancelled = false;
    Promise.all([getProject(projectId, passcode), listRubrics(projectId, passcode), listItems(projectId, passcode)])
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
      // Clear the scrub-bar coloring on unmount too (not just re-load), so
      // switching to Details/Progress doesn't leave a stale project's status
      // colors painted on unrelated rows.
      onItemStatusByRow?.({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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

  // Keep the scrub bar's Details-track blocks colored by every item's current
  // review status — not just whichever one was last clicked — so it stays
  // accurate as items are added/changed/re-fetched, not only on direct
  // user interaction.
  useEffect(() => {
    const statusByRow: Record<string, ProjectItemAction> = {};
    for (const item of allItems) statusByRow[item.detailRowId] = item.action;
    onItemStatusByRow?.(statusByRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function handleActionChange(itemId: string, action: ProjectItemAction) {
    patchItem(itemId, { action });
    await updateItemAction(projectId, itemId, { passcode, action });
  }

  async function handleAddDetails() {
    if (addSelection.size === 0) return;
    const added = await addItems(projectId, { passcode, detailRowIds: [...addSelection] });
    addItemsToStore(added);
    setAddSelection(new Set());
    setShowAddDetails(false);
  }

  async function handleAddRubric() {
    const rubric = await createRubric(projectId, { passcode, name: '', description: '', weight: 3 });
    addRubric(rubric);
  }

  const alreadyImportedIds = new Set(allItems.map((i) => i.detailRowId));
  const openItem = openItemId ? items[openItemId] : null;

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!project) return <p className="results-placeholder">Loading…</p>;

  if (openItem) {
    return (
      <ProjectItemView
        projectId={project.id}
        passcode={passcode}
        testMode={testMode}
        item={openItem}
        rubrics={rubrics}
        allItems={sorted}
        onBack={() => setOpenItemId(null)}
        onNavigate={setOpenItemId}
        onSeek={onSeek}
        onScorePatched={(itemId, patch) => patchItem(itemId, patch as Partial<ProjectItem>)}
      />
    );
  }

  return (
    <>
      <div className="project-panel__header">
        <button type="button" className="link-back" onClick={onBackToProjects}>
          ← All projects for this film
        </button>
        <div className="project-panel__toprow">
          <div className="project-panel__heading">
            <p className="section-heading">
              Project: <Flag code={countryCode(project.country)} /> {project.country}
            </p>
            <div className="project-panel__badges">
              <span className={`status-badge status-badge--${project.status}`}>{project.status}</span>
            </div>
          </div>
          <div className="project-panel__actions">
            <button type="button" className="btn" onClick={() => setShowAddDetails(true)}>
              + Manually add details
            </button>
            <button
              type="button"
              className={`chat-toggle-btn${agentsOpen ? ' chat-toggle-btn--active' : ''}`}
              title={agentsOpen ? 'Close research agent' : 'Open research agent'}
              aria-label={agentsOpen ? 'Close research agent' : 'Open research agent'}
              aria-pressed={agentsOpen}
              onClick={() => setAgentsOpen((v) => !v)}
            >
              <SparkleIcon width={16} height={16} />
              Agents
            </button>
          </div>
        </div>
      </div>

      <div className="project-panel__body">
        <div className="project-panel__main">
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
                          <th>Start</th>
                          <th>End</th>
                          <th>Importance</th>
                          <th>Subtitle</th>
                          <th>Verdict</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((item) => (
                          <tr key={item.id} className={`details-table__row--clickable details-table__row--${item.action}`} onClick={() => setOpenItemId(item.id)}>
                            <td className="details-table__cell--nowrap-exempt">{formatClock(item.startMs)}</td>
                            <td className="details-table__cell--nowrap-exempt">{formatClock(item.endMs)}</td>
                            <td>{item.importanceScore ?? <span className="results-placeholder">—</span>}</td>
                            <td>{item.subtitleText || <em>Visual only</em>}</td>
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
                if (!rubric.id) return;
                const updated = await updateRubric(projectId, rubric.id, { passcode, ...patch });
                updateRubricInPlace(updated);
              }}
              onRemove={async (i) => {
                const rubric = rubrics[i];
                if (!rubric.id) return;
                await deleteRubric(projectId, rubric.id, passcode);
                removeRubric(rubric.id);
              }}
            />
          )}
        </div>

        <div className={`project-panel__chat${agentsOpen ? ' project-panel__chat--open' : ''}`}>
          <ResearchChatPanel projectId={project.id} passcode={passcode} testMode={testMode} items={allItems} />
        </div>
      </div>

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
    </>
  );
}
