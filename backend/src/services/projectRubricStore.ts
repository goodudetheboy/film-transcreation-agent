import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { Rubric } from './projectTypes.js';

export type { Rubric } from './projectTypes.js';

export interface CreateRubricInput {
  name: string;
  description: string;
  weight: number;
  /** Whether this rubric's concern is tied to socially-current content (slang, memes,
   * viral references) that the Trend Agent should search live sources for. */
  trendEligible: boolean;
}

export type UpdateRubricInput = Partial<CreateRubricInput>;

/** Owns `projects/{projectId}/rubrics/{rubricId}`. */
export interface ProjectRubricStore {
  listRubrics(projectId: string): Promise<Rubric[]>;
  createRubric(projectId: string, input: CreateRubricInput): Promise<Rubric>;
  updateRubric(projectId: string, rubricId: string, patch: UpdateRubricInput): Promise<Rubric | undefined>;
  deleteRubric(projectId: string, rubricId: string): Promise<boolean>;
}

function rubricsCollection(firestore: Firestore, projectId: string) {
  return firestore.collection('projects').doc(projectId).collection('rubrics');
}

function newRubric(id: string, projectId: string, input: CreateRubricInput, now: string): Rubric {
  return {
    id,
    projectId,
    name: input.name,
    description: input.description,
    weight: input.weight,
    trendEligible: input.trendEligible,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFirestoreProjectRubricStore(firestore: Firestore): ProjectRubricStore {
  return {
    async listRubrics(projectId) {
      const snapshot = await rubricsCollection(firestore, projectId).orderBy('createdAt', 'asc').get();
      return snapshot.docs.map((d) => d.data() as Rubric);
    },

    async createRubric(projectId, input) {
      const rubric = newRubric(randomUUID(), projectId, input, new Date().toISOString());
      await rubricsCollection(firestore, projectId).doc(rubric.id).set(rubric);
      return rubric;
    },

    async updateRubric(projectId, rubricId, patch) {
      const ref = rubricsCollection(firestore, projectId).doc(rubricId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: Rubric = { ...(doc.data() as Rubric), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },

    async deleteRubric(projectId, rubricId) {
      const ref = rubricsCollection(firestore, projectId).doc(rubricId);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      return true;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryProjectRubricStore(): ProjectRubricStore {
  const rubrics = new Map<string, Rubric>(); // rubricId -> rubric

  return {
    async listRubrics(projectId) {
      return [...rubrics.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async createRubric(projectId, input) {
      const rubric = newRubric(randomUUID(), projectId, input, new Date().toISOString());
      rubrics.set(rubric.id, rubric);
      return rubric;
    },

    async updateRubric(projectId, rubricId, patch) {
      const current = rubrics.get(rubricId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: Rubric = { ...current, ...patch, updatedAt: new Date().toISOString() };
      rubrics.set(rubricId, updated);
      return updated;
    },

    async deleteRubric(projectId, rubricId) {
      const current = rubrics.get(rubricId);
      if (!current || current.projectId !== projectId) return false;
      return rubrics.delete(rubricId);
    },
  };
}
