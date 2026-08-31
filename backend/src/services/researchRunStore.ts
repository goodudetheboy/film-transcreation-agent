import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { ResearchRun, ResearchRunStatus } from './projectTypes.js';

export type { ResearchRun, ResearchRunStatus } from './projectTypes.js';

export interface CreateResearchRunInput {
  projectId: string;
  mode: 'need-research' | 'custom';
  itemIds: string[];
  rubricIds: string[];
  testMode: boolean;
}

/**
 * Owns `projects/{projectId}/researchRuns/{runId}`. Mirrors
 * discoveryJobStore.ts's status/log shape, but deliberately has no
 * `claimNextQueuedJob` — research runs stay foreground/inline per request
 * (see docs/adr/0025's flagged consequence), not routed through Discovery's
 * global sequential queue.
 */
export interface ResearchRunStore {
  createRun(input: CreateResearchRunInput): Promise<ResearchRun>;
  getRun(projectId: string, runId: string): Promise<ResearchRun | undefined>;
  listRuns(projectId: string): Promise<ResearchRun[]>;
  updateRun(projectId: string, runId: string, patch: Partial<ResearchRun>): Promise<ResearchRun | undefined>;
}

function runsCollection(firestore: Firestore, projectId: string) {
  return firestore.collection('projects').doc(projectId).collection('researchRuns');
}

function newRun(id: string, input: CreateResearchRunInput, now: string): ResearchRun {
  return {
    id,
    projectId: input.projectId,
    mode: input.mode,
    itemIds: input.itemIds,
    rubricIds: input.rubricIds,
    status: 'queued' as ResearchRunStatus,
    testMode: input.testMode,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    totalBatches: 0,
    completedBatches: 0,
  };
}

export function createFirestoreResearchRunStore(firestore: Firestore): ResearchRunStore {
  return {
    async createRun(input) {
      const run = newRun(randomUUID(), input, new Date().toISOString());
      await runsCollection(firestore, input.projectId).doc(run.id).set(run);
      return run;
    },

    async getRun(projectId, runId) {
      const doc = await runsCollection(firestore, projectId).doc(runId).get();
      return doc.exists ? (doc.data() as ResearchRun) : undefined;
    },

    async listRuns(projectId) {
      const snapshot = await runsCollection(firestore, projectId).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map((d) => d.data() as ResearchRun);
    },

    async updateRun(projectId, runId, patch) {
      const ref = runsCollection(firestore, projectId).doc(runId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: ResearchRun = { ...(doc.data() as ResearchRun), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryResearchRunStore(): ResearchRunStore {
  const runs = new Map<string, ResearchRun>(); // runId -> run

  return {
    async createRun(input) {
      const run = newRun(randomUUID(), input, new Date().toISOString());
      runs.set(run.id, run);
      return run;
    },

    async getRun(projectId, runId) {
      const run = runs.get(runId);
      return run && run.projectId === projectId ? run : undefined;
    },

    async listRuns(projectId) {
      return [...runs.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async updateRun(projectId, runId, patch) {
      const current = runs.get(runId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: ResearchRun = { ...current, ...patch, updatedAt: new Date().toISOString() };
      runs.set(runId, updated);
      return updated;
    },
  };
}
