import { Router, type Response } from 'express';
import type { DetailRowsStore } from '../services/detailRowsStore.js';
import type { ProjectStore } from '../services/projectStore.js';
import type { CreateRubricInput, ProjectRubricStore } from '../services/projectRubricStore.js';
import type { ProjectItemStore } from '../services/projectItemStore.js';
import type { ResearchRun, ResearchRunStore } from '../services/researchRunStore.js';
import type { ResearchRunEventBus } from '../services/researchRunEventBus.js';
import type { ResearchAgent, ResearchItem, ResearchResult } from '../services/researchAgent.js';
import type { ProjectItemAction, RubricScore } from '../services/projectTypes.js';
import { computeImportanceScore } from '../services/importanceScore.js';
import { detailRowsToProjectItemInputs } from '../services/projectItemImport.js';

export type ResearchRunStreamEvent =
  | { type: 'progress'; message: string }
  | { type: 'batch_done'; batchIndex: number; totalBatches: number; itemIds: string[]; results: ResearchResult[] }
  | { type: 'done'; summary: { totalItems: number; totalRecommendedForChange: number } }
  | { type: 'error'; message: string };

/** The resumable stream's frame shape — the *entire* current run document each
 * time, same "replay the doc, not a diff" convention as films.ts's prep-status/
 * discovery-job streams (docs/adr/0020), not the richer per-batch-results shape
 * above (which only the run's own originating kickoff connection needs live). */
type RunUpdateEvent = { type: 'run_update'; run: ResearchRun };

const ITEM_ACTIONS: ProjectItemAction[] = ['pending', 'accepted', 'rejected', 'need-research'];

function writeSSE(res: Response, event: unknown): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface ProjectsRouteDeps {
  projectStore: ProjectStore;
  projectRubricStore: ProjectRubricStore;
  projectItemStore: ProjectItemStore;
  detailRowsStore: DetailRowsStore;
  researchRunStore: ResearchRunStore;
  researchAgent: ResearchAgent;
  mockResearchAgent: ResearchAgent;
  eventBus: ResearchRunEventBus;
}

async function enrichProject(deps: ProjectsRouteDeps, project: Awaited<ReturnType<ProjectStore['getProject']>>) {
  if (!project) return project;
  const [items, runs] = await Promise.all([
    deps.projectItemStore.listItems(project.id),
    deps.researchRunStore.listRuns(project.id),
  ]);
  let pendingCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let needResearchCount = 0;
  for (const item of items) {
    if (item.action === 'pending') pendingCount++;
    else if (item.action === 'accepted') acceptedCount++;
    else if (item.action === 'rejected') rejectedCount++;
    else if (item.action === 'need-research') needResearchCount++;
  }
  // listRuns returns newest-first (see researchRunStore.ts), so runs[0] is the latest.
  const agentStatus = runs[0]?.status ?? null;
  return { ...project, pendingCount, acceptedCount, rejectedCount, needResearchCount, agentStatus };
}

function isValidAction(value: unknown): value is ProjectItemAction {
  return typeof value === 'string' && (ITEM_ACTIONS as string[]).includes(value);
}

export function projectsRoute(deps: ProjectsRouteDeps): Router {
  const router = Router();

  // ---- Projects -----------------------------------------------------------

  router.get('/api/projects', async (_req, res) => {
    const projects = await deps.projectStore.listProjects();
    res.status(200).json(await Promise.all(projects.map((p) => enrichProject(deps, p))));
  });

  router.get('/api/projects/:id', async (req, res) => {
    const project = await deps.projectStore.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    res.status(200).json(await enrichProject(deps, project));
  });

  router.patch('/api/projects/:id', async (req, res) => {
    const { name, note, status } = req.body ?? {};
    const patch: { name?: string; note?: string; status?: 'draft' | 'in_progress' | 'completed' | 'abandoned' } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
      patch.name = name;
    }
    if (note !== undefined) {
      if (typeof note !== 'string') {
        res.status(400).json({ error: 'note must be a string' });
        return;
      }
      patch.note = note;
    }
    if (status !== undefined) {
      if (!['draft', 'in_progress', 'completed', 'abandoned'].includes(status)) {
        res.status(400).json({ error: 'status must be one of draft/in_progress/completed/abandoned' });
        return;
      }
      patch.status = status;
    }
    const updated = await deps.projectStore.updateProject(req.params.id, patch);
    if (!updated) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    res.status(200).json(updated);
  });

  // ---- Rubrics --------------------------------------------------------------

  router.get('/api/projects/:id/rubrics', async (req, res) => {
    res.status(200).json(await deps.projectRubricStore.listRubrics(req.params.id));
  });

  router.post('/api/projects/:id/rubrics', async (req, res) => {
    const project = await deps.projectStore.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    const { name, description, weight } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (typeof description !== 'string' || description.trim() === '') {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    const rubricWeight = typeof weight === 'number' ? weight : 3;
    if (!Number.isInteger(rubricWeight) || rubricWeight < 1 || rubricWeight > 5) {
      res.status(400).json({ error: 'weight must be an integer 1-5' });
      return;
    }
    const rubric = await deps.projectRubricStore.createRubric(project.id, { name, description, weight: rubricWeight });
    res.status(201).json(rubric);
  });

  router.patch('/api/projects/:id/rubrics/:rubricId', async (req, res) => {
    const { name, description, weight } = req.body ?? {};
    const patch: Partial<CreateRubricInput> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (weight !== undefined) {
      if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
        res.status(400).json({ error: 'weight must be an integer 1-5' });
        return;
      }
      patch.weight = weight;
    }
    const updated = await deps.projectRubricStore.updateRubric(req.params.id, req.params.rubricId, patch);
    if (!updated) {
      res.status(404).json({ error: 'rubric not found' });
      return;
    }
    res.status(200).json(updated);
  });

  router.delete('/api/projects/:id/rubrics/:rubricId', async (req, res) => {
    const deleted = await deps.projectRubricStore.deleteRubric(req.params.id, req.params.rubricId);
    if (!deleted) {
      res.status(404).json({ error: 'rubric not found' });
      return;
    }
    res.status(204).end();
  });

  // ---- Items ------------------------------------------------------------

  router.get('/api/projects/:id/items', async (req, res) => {
    res.status(200).json(await deps.projectItemStore.listItems(req.params.id));
  });

  router.post('/api/projects/:id/items', async (req, res) => {
    const project = await deps.projectStore.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    const { detailRowIds } = req.body ?? {};
    if (!Array.isArray(detailRowIds) || detailRowIds.length === 0) {
      res.status(400).json({ error: 'detailRowIds must be a non-empty array' });
      return;
    }
    const idSet = new Set(detailRowIds);
    const rows = (await deps.detailRowsStore.listRows(project.sourceFilmId)).filter((r) => idSet.has(r.id));
    const created = await deps.projectItemStore.createItems(
      project.id,
      detailRowsToProjectItemInputs(project.sourceFilmId, rows),
    );
    res.status(201).json(created);
  });

  router.patch('/api/projects/:id/items/:itemId', async (req, res) => {
    const { action } = req.body ?? {};
    if (action !== undefined && !isValidAction(action)) {
      res.status(400).json({ error: 'action must be one of pending/accepted/rejected/need-research' });
      return;
    }
    const updated = await deps.projectItemStore.updateItem(
      req.params.id,
      req.params.itemId,
      action !== undefined ? { action } : {},
    );
    if (!updated) {
      res.status(404).json({ error: 'item not found' });
      return;
    }
    res.status(200).json(updated);
  });

  router.delete('/api/projects/:id/items/:itemId', async (req, res) => {
    const deleted = await deps.projectItemStore.deleteItem(req.params.id, req.params.itemId);
    if (!deleted) {
      res.status(404).json({ error: 'item not found' });
      return;
    }
    res.status(204).end();
  });

  // Manual edit route — the same patchScore() mutation surface the chat tool
  // executor calls (researchChatAgent.ts), so a human edit and an agent edit
  // go through identical code.
  router.patch('/api/projects/:id/items/:itemId/scores/:rubricId', async (req, res) => {
    const item = await deps.projectItemStore.getItem(req.params.id, req.params.itemId);
    if (!item) {
      res.status(404).json({ error: 'item not found' });
      return;
    }
    const { score, reasoning, evidence, userNote } = req.body ?? {};
    if (score !== undefined && typeof score !== 'number') {
      res.status(400).json({ error: 'score must be a number' });
      return;
    }

    const rubrics = await deps.projectRubricStore.listRubrics(req.params.id);
    const now = new Date().toISOString();
    const existing = item.scores.find((s) => s.rubricId === req.params.rubricId);
    const projected: RubricScore = {
      rubricId: req.params.rubricId,
      score: typeof score === 'number' ? score : existing?.score ?? 0,
      reasoning: typeof reasoning === 'string' ? reasoning : existing?.reasoning ?? '',
      evidence: typeof evidence === 'string' ? evidence : existing?.evidence ?? '',
      sources: existing?.sources ?? [],
      userNote: typeof userNote === 'string' ? userNote : existing?.userNote,
      updatedAt: now,
      updatedBy: 'user',
    };
    const projectedScores = existing
      ? item.scores.map((s) => (s.rubricId === projected.rubricId ? projected : s))
      : [...item.scores, projected];
    const importanceScore = computeImportanceScore(projectedScores, rubrics);

    const updated = await deps.projectItemStore.patchScore(req.params.id, req.params.itemId, req.params.rubricId, {
      score, reasoning, evidence, userNote, updatedBy: 'user', importanceScore,
    });
    res.status(200).json(updated);
  });

  // ---- Research runs ------------------------------------------------------

  router.get('/api/projects/:id/research-runs', async (req, res) => {
    res.status(200).json(await deps.researchRunStore.listRuns(req.params.id));
  });

  // The SSE kickoff route: streams events directly to whoever made the request,
  // same "POST responds with text/event-stream" convention as docs/adr/0013.
  // Runs foreground/inline (not through Discovery's global sequential queue —
  // see docs/adr/0025's flagged consequence).
  router.post('/api/projects/:id/research-runs', async (req, res) => {
    const project = await deps.projectStore.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    const { testMode, mode, itemIds: customItemIds } = req.body ?? {};
    if (mode !== 'need-research' && mode !== 'custom') {
      res.status(400).json({ error: 'mode must be "need-research" or "custom"' });
      return;
    }
    if (mode === 'custom' && (!Array.isArray(customItemIds) || customItemIds.length === 0)) {
      res.status(400).json({ error: 'itemIds is required and non-empty for mode "custom"' });
      return;
    }

    const [allItems, rubrics] = await Promise.all([
      deps.projectItemStore.listItems(project.id),
      deps.projectRubricStore.listRubrics(project.id),
    ]);
    const targetItems =
      mode === 'need-research'
        ? allItems.filter((i) => i.action === 'need-research')
        : allItems.filter((i) => new Set(customItemIds as string[]).has(i.id));

    if (targetItems.length === 0) {
      res.status(400).json({ error: 'no items matched — nothing to research' });
      return;
    }

    const useMock = testMode !== false;
    const agent = useMock ? deps.mockResearchAgent : deps.researchAgent;

    const run = await deps.researchRunStore.createRun({
      projectId: project.id,
      mode,
      itemIds: targetItems.map((i) => i.id),
      rubricIds: rubrics.map((r) => r.id),
      testMode: useMock,
    });
    const channel = `researchRun:${run.id}`;
    const publishRunUpdate = (r: ResearchRun) => deps.eventBus.publish(channel, { type: 'run_update', run: r } satisfies RunUpdateEvent);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const emit = (event: ResearchRunStreamEvent) => writeSSE(res, event);

    try {
      const running = await deps.researchRunStore.updateRun(project.id, run.id, {
        status: 'running',
        startedAt: new Date().toISOString(),
      });
      if (running) publishRunUpdate(running);
      emit({ type: 'progress', message: useMock ? 'researching (test mode — mock data)' : 'researching' });

      const researchItems: ResearchItem[] = targetItems.map((i) => ({
        id: i.id,
        scriptLine: i.subtitleText,
        sceneDescription: i.sceneDescription,
      }));

      let completedBatches = 0;
      const results = await agent.researchBatch({
        items: researchItems,
        targetCountry: project.country,
        rubrics,
        onBatchComplete: async (progress) => {
          for (const result of progress.results) {
            const importanceScore = computeImportanceScore(result.scores, rubrics);
            await deps.projectItemStore.applyResearchResult(project.id, result.itemId, {
              scores: result.scores,
              summary: result.summary,
              shouldTranscreate: result.shouldTranscreate,
              suggestedReplacement: result.suggestedReplacement ?? null,
              importanceScore,
            });
          }
          completedBatches++;
          const updatedRun = await deps.researchRunStore.updateRun(project.id, run.id, {
            totalBatches: progress.totalBatches,
            completedBatches,
          });
          if (updatedRun) publishRunUpdate(updatedRun);
          emit({
            type: 'batch_done',
            batchIndex: progress.batchIndex,
            totalBatches: progress.totalBatches,
            itemIds: progress.itemIds,
            results: progress.results,
          });
        },
      });

      const done = await deps.researchRunStore.updateRun(project.id, run.id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
      });
      if (done) publishRunUpdate(done);
      const totalRecommendedForChange = results.filter((r) => r.shouldTranscreate).length;
      emit({ type: 'done', summary: { totalItems: results.length, totalRecommendedForChange } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const errored = await deps.researchRunStore.updateRun(project.id, run.id, {
        status: 'error',
        errorMessage: message,
        finishedAt: new Date().toISOString(),
      });
      if (errored) publishRunUpdate(errored);
      emit({ type: 'error', message });
    } finally {
      res.end();
    }
  });

  // The resumable stream route — mirrors films.ts's discovery-jobs/:jobId/stream
  // exactly (docs/adr/0020): replays the *entire* current run document, not a
  // diff, then forwards every subsequent run_update until a terminal status.
  router.get('/api/projects/:id/research-runs/:runId/stream', async (req, res) => {
    const run = await deps.researchRunStore.getRun(req.params.id, req.params.runId);
    if (!run) {
      res.status(404).json({ error: 'research run not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    const isTerminal = (r: ResearchRun) => r.status === 'done' || r.status === 'error';
    const send = (r: ResearchRun) => writeSSE(res, { type: 'run_update', run: r } satisfies RunUpdateEvent);

    if (isTerminal(run)) {
      send(run);
      res.end();
      return;
    }

    const unsubscribe = deps.eventBus.subscribe(`researchRun:${run.id}`, (event) => {
      const e = event as RunUpdateEvent;
      send(e.run);
      if (isTerminal(e.run)) {
        unsubscribe();
        res.end();
      }
    });
    req.on('close', unsubscribe);

    const latest = await deps.researchRunStore.getRun(req.params.id, req.params.runId);
    if (latest && isTerminal(latest)) {
      send(latest);
      unsubscribe();
      res.end();
    } else if (latest) {
      send(latest);
    }
  });

  return router;
}
