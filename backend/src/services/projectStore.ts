import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { Project } from './projectTypes.js';

export type { Project } from './projectTypes.js';

export interface CreateProjectInput {
  name: string;
  country: string;
  sourceFilmId: string;
  note?: string;
}

/**
 * Owns the `projects/{projectId}` document only — rubrics/items/researchRuns/
 * chatSessions live in their own sibling stores (projectRubricStore.ts,
 * projectItemStore.ts, researchRunStore.ts, chatSessionStore.ts), same
 * per-concern split as filmStore.ts vs. detailRowsStore.ts/discoveryJobStore.ts.
 *
 * Moved off the in-memory Map from docs/adr/0013 to Firestore — see
 * docs/adr/0025 for why (chat sessions need to survive restarts, the Library's
 * agent-status column needs to reflect state with nobody's SSE stream open).
 */
export interface ProjectStore {
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'note' | 'status'>>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
}

const PROJECTS_COLLECTION = 'projects';

function newProject(input: CreateProjectInput, now: string): Project {
  return {
    id: randomUUID(),
    name: input.name,
    country: input.country,
    sourceFilmId: input.sourceFilmId,
    note: input.note ?? '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

export function createFirestoreProjectStore(firestore: Firestore): ProjectStore {
  const collection = firestore.collection(PROJECTS_COLLECTION);

  return {
    async createProject(input) {
      const project = newProject(input, new Date().toISOString());
      await collection.doc(project.id).set(project);
      return project;
    },

    async getProject(id) {
      const doc = await collection.doc(id).get();
      return doc.exists ? (doc.data() as Project) : undefined;
    },

    async listProjects() {
      const snapshot = await collection.orderBy('createdAt', 'desc').get();
      return snapshot.docs.map((d) => d.data() as Project);
    },

    async updateProject(id, patch) {
      const ref = collection.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: Project = { ...(doc.data() as Project), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },

    async deleteProject(id) {
      const ref = collection.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await firestore.recursiveDelete(ref);
      return true;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryProjectStore(): ProjectStore {
  const projects = new Map<string, Project>();

  return {
    async createProject(input) {
      const project = newProject(input, new Date().toISOString());
      projects.set(project.id, project);
      return project;
    },

    async getProject(id) {
      return projects.get(id);
    },

    async listProjects() {
      return [...projects.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async updateProject(id, patch) {
      const existing = projects.get(id);
      if (!existing) return undefined;
      const updated: Project = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      projects.set(id, updated);
      return updated;
    },

    async deleteProject(id) {
      return projects.delete(id);
    },
  };
}
