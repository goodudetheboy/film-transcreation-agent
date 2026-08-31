import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { ProjectItem, ProjectItemAction, RubricScore, SuggestedReplacement, TrendSuggestion } from './projectTypes.js';

export type { ProjectItem } from './projectTypes.js';

export interface CreateProjectItemInput {
  filmId: string;
  detailRowId: string;
  startMs: number;
  endMs: number;
  subtitleText: string;
  sceneDescription: string;
  customValues: Record<string, string>;
}

export interface PatchScoreInput {
  score?: number;
  reasoning?: string;
  evidence?: string;
  sources?: string[];
  userNote?: string;
  updatedBy: RubricScore['updatedBy'];
  /** Recomputed by the caller via importanceScore.ts's computeImportanceScore, persisted
   * alongside the score patch in the same write so the two never disagree. */
  importanceScore?: number | null;
}

export interface ApplyResearchResultInput {
  scores: RubricScore[];
  summary: string;
  shouldTranscreate: boolean;
  suggestedReplacement: SuggestedReplacement | null;
  importanceScore: number | null;
}

function newItem(id: string, projectId: string, input: CreateProjectItemInput, now: string): ProjectItem {
  return {
    id,
    projectId,
    filmId: input.filmId,
    detailRowId: input.detailRowId,
    startMs: input.startMs,
    endMs: input.endMs,
    subtitleText: input.subtitleText,
    sceneDescription: input.sceneDescription,
    customValues: input.customValues,
    action: 'pending',
    importanceScore: null,
    scores: [],
    summary: null,
    shouldTranscreate: null,
    suggestedReplacement: null,
    trendSuggestions: null,
    lastResearchedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function upsertScore(scores: RubricScore[], rubricId: string, patch: PatchScoreInput, now: string): RubricScore[] {
  const existing = scores.find((s) => s.rubricId === rubricId);
  const userNote = patch.userNote ?? existing?.userNote;
  const merged: RubricScore = {
    rubricId,
    score: patch.score ?? existing?.score ?? 0,
    reasoning: patch.reasoning ?? existing?.reasoning ?? '',
    evidence: patch.evidence ?? existing?.evidence ?? '',
    sources: patch.sources ?? existing?.sources ?? [],
    // Firestore's .set() rejects an explicit `undefined` value (throws "Cannot
    // use 'undefined' as a Firestore value") — omit the key entirely rather
    // than assigning userNote: undefined when neither the patch nor the
    // existing score has one yet. Only the in-memory fake tolerated this;
    // real Firestore does not (found via live verification, not a unit test).
    ...(userNote !== undefined ? { userNote } : {}),
    updatedAt: now,
    updatedBy: patch.updatedBy,
  };
  return existing ? scores.map((s) => (s.rubricId === rubricId ? merged : s)) : [...scores, merged];
}

/**
 * Owns `projects/{projectId}/items/{itemId}` — the single mutation surface
 * (`patchScore`/`applyResearchResult`) shared by the manual-edit route, the
 * batch research-run path, and the chat tool executor, so all three ways of
 * touching a rubric score go through the same code.
 */
export interface ProjectItemStore {
  listItems(projectId: string): Promise<ProjectItem[]>;
  getItem(projectId: string, itemId: string): Promise<ProjectItem | undefined>;
  /** Bulk import from DetailRows — skips rows already imported (dedupes by detailRowId)
   * so "+ Manually add details" can be called repeatedly without creating duplicates. */
  createItems(projectId: string, inputs: CreateProjectItemInput[]): Promise<ProjectItem[]>;
  updateItem(projectId: string, itemId: string, patch: Partial<Pick<ProjectItem, 'action'>>): Promise<ProjectItem | undefined>;
  deleteItem(projectId: string, itemId: string): Promise<boolean>;
  patchScore(projectId: string, itemId: string, rubricId: string, patch: PatchScoreInput): Promise<ProjectItem | undefined>;
  /** Applied by the batch research-run path: replaces the full exhaustive score set
   * plus summary/verdict/suggestion in one write, and stamps lastResearchedAt. */
  applyResearchResult(projectId: string, itemId: string, result: ApplyResearchResultInput): Promise<ProjectItem | undefined>;
  /** Used by the chat tool executor's propose_replacement tool — setting a suggestion
   * implies recommending transcreation, so shouldTranscreate flips to true alongside it. */
  setSuggestedReplacement(projectId: string, itemId: string, suggestion: SuggestedReplacement): Promise<ProjectItem | undefined>;
  /** Used by the Trend Agent chaining step in the research-run route — additive
   * alongside suggestedReplacement, never flips shouldTranscreate on its own. */
  setTrendSuggestions(projectId: string, itemId: string, suggestions: TrendSuggestion[]): Promise<ProjectItem | undefined>;
}

function itemsCollection(firestore: Firestore, projectId: string) {
  return firestore.collection('projects').doc(projectId).collection('items');
}

export function createFirestoreProjectItemStore(firestore: Firestore): ProjectItemStore {
  return {
    async listItems(projectId) {
      const snapshot = await itemsCollection(firestore, projectId).orderBy('createdAt', 'asc').get();
      return snapshot.docs.map((d) => d.data() as ProjectItem);
    },

    async getItem(projectId, itemId) {
      const doc = await itemsCollection(firestore, projectId).doc(itemId).get();
      return doc.exists ? (doc.data() as ProjectItem) : undefined;
    },

    async createItems(projectId, inputs) {
      const existing = await itemsCollection(firestore, projectId).get();
      const existingDetailRowIds = new Set(existing.docs.map((d) => (d.data() as ProjectItem).detailRowId));
      const toCreate = inputs.filter((i) => !existingDetailRowIds.has(i.detailRowId));
      if (toCreate.length === 0) return [];

      const now = new Date().toISOString();
      const batch = firestore.batch();
      const created: ProjectItem[] = [];
      for (const input of toCreate) {
        const item = newItem(randomUUID(), projectId, input, now);
        batch.set(itemsCollection(firestore, projectId).doc(item.id), item);
        created.push(item);
      }
      await batch.commit();
      return created;
    },

    async updateItem(projectId, itemId, patch) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: ProjectItem = { ...(doc.data() as ProjectItem), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },

    async deleteItem(projectId, itemId) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      return true;
    },

    async patchScore(projectId, itemId, rubricId, patch) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const current = doc.data() as ProjectItem;
      const now = new Date().toISOString();
      const updated: ProjectItem = {
        ...current,
        scores: upsertScore(current.scores, rubricId, patch, now),
        importanceScore: patch.importanceScore !== undefined ? patch.importanceScore : current.importanceScore,
        updatedAt: now,
      };
      await ref.set(updated);
      return updated;
    },

    async applyResearchResult(projectId, itemId, result) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const current = doc.data() as ProjectItem;
      const now = new Date().toISOString();
      const updated: ProjectItem = {
        ...current,
        scores: result.scores,
        summary: result.summary,
        shouldTranscreate: result.shouldTranscreate,
        suggestedReplacement: result.suggestedReplacement,
        importanceScore: result.importanceScore,
        lastResearchedAt: now,
        updatedAt: now,
      };
      await ref.set(updated);
      return updated;
    },

    async setSuggestedReplacement(projectId, itemId, suggestion) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: ProjectItem = {
        ...(doc.data() as ProjectItem),
        suggestedReplacement: suggestion,
        shouldTranscreate: true,
        updatedAt: new Date().toISOString(),
      };
      await ref.set(updated);
      return updated;
    },

    async setTrendSuggestions(projectId, itemId, suggestions) {
      const ref = itemsCollection(firestore, projectId).doc(itemId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: ProjectItem = {
        ...(doc.data() as ProjectItem),
        trendSuggestions: suggestions,
        updatedAt: new Date().toISOString(),
      };
      await ref.set(updated);
      return updated;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryProjectItemStore(): ProjectItemStore {
  const items = new Map<string, ProjectItem>(); // itemId -> item

  return {
    async listItems(projectId) {
      return [...items.values()]
        .filter((i) => i.projectId === projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async getItem(projectId, itemId) {
      const item = items.get(itemId);
      return item && item.projectId === projectId ? item : undefined;
    },

    async createItems(projectId, inputs) {
      const existingDetailRowIds = new Set(
        [...items.values()].filter((i) => i.projectId === projectId).map((i) => i.detailRowId),
      );
      const toCreate = inputs.filter((i) => !existingDetailRowIds.has(i.detailRowId));
      const now = new Date().toISOString();
      const created: ProjectItem[] = [];
      for (const input of toCreate) {
        const item = newItem(randomUUID(), projectId, input, now);
        items.set(item.id, item);
        created.push(item);
      }
      return created;
    },

    async updateItem(projectId, itemId, patch) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: ProjectItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
      items.set(itemId, updated);
      return updated;
    },

    async deleteItem(projectId, itemId) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return false;
      return items.delete(itemId);
    },

    async patchScore(projectId, itemId, rubricId, patch) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return undefined;
      const now = new Date().toISOString();
      const updated: ProjectItem = {
        ...current,
        scores: upsertScore(current.scores, rubricId, patch, now),
        importanceScore: patch.importanceScore !== undefined ? patch.importanceScore : current.importanceScore,
        updatedAt: now,
      };
      items.set(itemId, updated);
      return updated;
    },

    async applyResearchResult(projectId, itemId, result) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return undefined;
      const now = new Date().toISOString();
      const updated: ProjectItem = {
        ...current,
        scores: result.scores,
        summary: result.summary,
        shouldTranscreate: result.shouldTranscreate,
        suggestedReplacement: result.suggestedReplacement,
        importanceScore: result.importanceScore,
        lastResearchedAt: now,
        updatedAt: now,
      };
      items.set(itemId, updated);
      return updated;
    },

    async setSuggestedReplacement(projectId, itemId, suggestion) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: ProjectItem = {
        ...current,
        suggestedReplacement: suggestion,
        shouldTranscreate: true,
        updatedAt: new Date().toISOString(),
      };
      items.set(itemId, updated);
      return updated;
    },

    async setTrendSuggestions(projectId, itemId, suggestions) {
      const current = items.get(itemId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: ProjectItem = {
        ...current,
        trendSuggestions: suggestions,
        updatedAt: new Date().toISOString(),
      };
      items.set(itemId, updated);
      return updated;
    },
  };
}

export type { ProjectItemAction };
