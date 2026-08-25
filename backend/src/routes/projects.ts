import { Router, type Response } from 'express';
import type { ProjectStore } from '../services/projectStore.js';
import type { ResearchAgent, ResearchResult, Rubric } from '../services/researchAgent.js';

export type ResearchStreamEvent =
  | { type: 'progress'; message: string }
  | {
      type: 'batch_done';
      batchIndex: number;
      totalBatches: number;
      itemIds: string[];
      results: ResearchResult[];
    }
  | { type: 'done'; summary: { totalItems: number; totalRecommendedForChange: number } }
  | { type: 'error'; message: string };

function writeEvent(res: Response, event: ResearchStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface ProjectsRouteDeps {
  store: ProjectStore;
  researchAgent: ResearchAgent;
  mockResearchAgent: ResearchAgent;
  defaultRubrics: Rubric[];
}

export function projectsRoute(deps: ProjectsRouteDeps): Router {
  const router = Router();

  router.post('/api/projects', (req, res) => {
    const { country, items, rubrics } = req.body ?? {};

    if (typeof country !== 'string' || country.trim() === '') {
      res.status(400).json({ error: 'country is required' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }
    for (const item of items) {
      if (typeof item?.scriptLine !== 'string' || typeof item?.sceneDescription !== 'string') {
        res.status(400).json({ error: 'each item needs scriptLine and sceneDescription strings' });
        return;
      }
    }

    const project = deps.store.createProject({
      country,
      items,
      rubrics: Array.isArray(rubrics) && rubrics.length > 0 ? rubrics : deps.defaultRubrics,
    });
    res.status(201).json(project);
  });

  router.get('/api/projects', (_req, res) => {
    res.status(200).json(deps.store.listProjects());
  });

  router.get('/api/projects/:id', (req, res) => {
    const project = deps.store.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    res.status(200).json(project);
  });

  router.post('/api/projects/:id/research', async (req, res) => {
    const project = deps.store.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    const { testMode } = req.body ?? {};
    const useMock = testMode !== false;
    const agent = useMock ? deps.mockResearchAgent : deps.researchAgent;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      writeEvent(res, {
        type: 'progress',
        message: useMock ? 'researching (test mode — mock data)' : 'researching',
      });
      deps.store.updateProject(project.id, {
        status: 'researching',
        batches: [],
        results: [],
      });

      const results = await agent.researchBatch({
        items: project.items,
        targetCountry: project.country,
        rubrics: project.rubrics,
        onBatchComplete: (progress) => {
          const current = deps.store.getProject(project.id);
          if (!current) return;
          deps.store.updateProject(project.id, {
            batches: [
              ...current.batches,
              { index: progress.batchIndex, itemIds: progress.itemIds, status: 'done' },
            ],
            results: [...current.results, ...progress.results],
          });
          writeEvent(res, {
            type: 'batch_done',
            batchIndex: progress.batchIndex,
            totalBatches: progress.totalBatches,
            itemIds: progress.itemIds,
            results: progress.results,
          });
        },
      });

      deps.store.updateProject(project.id, { status: 'done' });
      const totalRecommendedForChange = results.filter((r) => r.shouldTranscreate).length;
      writeEvent(res, {
        type: 'done',
        summary: { totalItems: results.length, totalRecommendedForChange },
      });
    } catch (err) {
      deps.store.updateProject(project.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'unknown error',
      });
      writeEvent(res, {
        type: 'error',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      res.end();
    }
  });

  return router;
}
