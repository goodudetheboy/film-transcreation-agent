import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { DiscoveryJob } from './filmTypes.js';

export type { DiscoveryJob } from './filmTypes.js';

export interface CreateDiscoveryJobInput {
  filmId: string;
  agentNumber?: number;
  name?: string | null;
  specialInstruction: string;
  targetColumns: string[];
  testMode: boolean;
}

/**
 * Owns `films/{filmId}/discoveryJobs/{jobId}` — one document per agent "pass".
 * `status: 'queued'` on the job itself IS the work queue (see
 * discoveryQueueWorker.ts): `claimNextQueuedJob` runs the FIFO claim across
 * every film via a Firestore collection-group query, so passes from different
 * films still queue and drain in one global, sequential order (per the
 * "queued, not parallel" pass-concurrency decision).
 */
export interface DiscoveryJobStore {
  createJob(input: CreateDiscoveryJobInput): Promise<DiscoveryJob>;
  getJob(filmId: string, jobId: string): Promise<DiscoveryJob | undefined>;
  listJobs(filmId: string): Promise<DiscoveryJob[]>;
  updateJob(filmId: string, jobId: string, patch: Partial<DiscoveryJob>): Promise<DiscoveryJob | undefined>;
  claimNextQueuedJob(): Promise<DiscoveryJob | undefined>;
  resetStaleRunningJobs(): Promise<void>;
}

function jobsCollection(firestore: Firestore, filmId: string) {
  return firestore.collection('films').doc(filmId).collection('discoveryJobs');
}

async function nextAgentAndPassNumber(
  existingJobs: DiscoveryJob[],
  requestedAgentNumber: number | undefined,
): Promise<{ agentNumber: number; passNumber: number }> {
  if (requestedAgentNumber !== undefined) {
    const passNumbers = existingJobs
      .filter((j) => j.agentNumber === requestedAgentNumber)
      .map((j) => j.passNumber);
    return { agentNumber: requestedAgentNumber, passNumber: (passNumbers.length ? Math.max(...passNumbers) : 0) + 1 };
  }
  const agentNumbers = existingJobs.map((j) => j.agentNumber);
  return { agentNumber: (agentNumbers.length ? Math.max(...agentNumbers) : 0) + 1, passNumber: 1 };
}

function newJob(id: string, input: CreateDiscoveryJobInput, agentNumber: number, passNumber: number, now: string): DiscoveryJob {
  return {
    id,
    filmId: input.filmId,
    agentNumber,
    passNumber,
    name: input.name ?? null,
    specialInstruction: input.specialInstruction,
    targetColumns: input.targetColumns,
    status: 'queued',
    testMode: input.testMode,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    log: [{ ts: now, message: 'Queued.' }],
    resultRows: [],
    conversationHistory: [],
    commentHistory: [],
  };
}

export function createFirestoreDiscoveryJobStore(firestore: Firestore): DiscoveryJobStore {
  return {
    async createJob(input) {
      const existing = (await jobsCollection(firestore, input.filmId).get()).docs.map((d) => d.data() as DiscoveryJob);
      const { agentNumber, passNumber } = await nextAgentAndPassNumber(existing, input.agentNumber);
      const now = new Date().toISOString();
      const job = newJob(randomUUID(), input, agentNumber, passNumber, now);
      await jobsCollection(firestore, input.filmId).doc(job.id).set(job);
      return job;
    },

    async getJob(filmId, jobId) {
      const doc = await jobsCollection(firestore, filmId).doc(jobId).get();
      return doc.exists ? (doc.data() as DiscoveryJob) : undefined;
    },

    async listJobs(filmId) {
      const snapshot = await jobsCollection(firestore, filmId).orderBy('createdAt', 'asc').get();
      return snapshot.docs.map((d) => d.data() as DiscoveryJob);
    },

    async updateJob(filmId, jobId, patch) {
      const ref = jobsCollection(firestore, filmId).doc(jobId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: DiscoveryJob = { ...(doc.data() as DiscoveryJob), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },

    async claimNextQueuedJob() {
      const snapshot = await firestore
        .collectionGroup('discoveryJobs')
        .where('status', '==', 'queued')
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get();
      if (snapshot.empty) return undefined;
      const docRef = snapshot.docs[0].ref;

      return firestore.runTransaction(async (tx) => {
        const doc = await tx.get(docRef);
        if (!doc.exists) return undefined;
        const data = doc.data() as DiscoveryJob;
        if (data.status !== 'queued') return undefined;
        const now = new Date().toISOString();
        const updated: DiscoveryJob = {
          ...data,
          status: 'running',
          startedAt: now,
          updatedAt: now,
          log: [...data.log, { ts: now, message: 'Started.' }],
        };
        tx.set(docRef, updated);
        return updated;
      });
    },

    async resetStaleRunningJobs() {
      // Ordered by createdAt too (even though unused here) so this reuses the same
      // composite index as claimNextQueuedJob's query, rather than needing a second
      // single-field collection-group index on `status` alone.
      const snapshot = await firestore
        .collectionGroup('discoveryJobs')
        .where('status', '==', 'running')
        .orderBy('createdAt', 'asc')
        .get();
      if (snapshot.empty) return;
      const now = new Date().toISOString();
      const batch = firestore.batch();
      for (const doc of snapshot.docs) {
        const data = doc.data() as DiscoveryJob;
        batch.set(doc.ref, {
          ...data,
          status: 'queued',
          updatedAt: now,
          log: [...data.log, { ts: now, message: 'Reset to queued after a worker restart.' }],
        });
      }
      await batch.commit();
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryDiscoveryJobStore(): DiscoveryJobStore {
  const jobs = new Map<string, DiscoveryJob>();

  return {
    async createJob(input) {
      const existing = [...jobs.values()].filter((j) => j.filmId === input.filmId);
      const { agentNumber, passNumber } = await nextAgentAndPassNumber(existing, input.agentNumber);
      const now = new Date().toISOString();
      const job = newJob(randomUUID(), input, agentNumber, passNumber, now);
      jobs.set(job.id, job);
      return job;
    },

    async getJob(filmId, jobId) {
      const job = jobs.get(jobId);
      return job && job.filmId === filmId ? job : undefined;
    },

    async listJobs(filmId) {
      return [...jobs.values()]
        .filter((j) => j.filmId === filmId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async updateJob(filmId, jobId, patch) {
      const current = jobs.get(jobId);
      if (!current || current.filmId !== filmId) return undefined;
      const updated: DiscoveryJob = { ...current, ...patch, updatedAt: new Date().toISOString() };
      jobs.set(jobId, updated);
      return updated;
    },

    async claimNextQueuedJob() {
      const queued = [...jobs.values()]
        .filter((j) => j.status === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const next = queued[0];
      if (!next) return undefined;
      const now = new Date().toISOString();
      const updated: DiscoveryJob = {
        ...next,
        status: 'running',
        startedAt: now,
        updatedAt: now,
        log: [...next.log, { ts: now, message: 'Started.' }],
      };
      jobs.set(next.id, updated);
      return updated;
    },

    async resetStaleRunningJobs() {
      const now = new Date().toISOString();
      for (const job of jobs.values()) {
        if (job.status === 'running') {
          jobs.set(job.id, {
            ...job,
            status: 'queued',
            updatedAt: now,
            log: [...job.log, { ts: now, message: 'Reset to queued after a worker restart.' }],
          });
        }
      }
    },
  };
}
