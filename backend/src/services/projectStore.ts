import { randomUUID } from 'node:crypto';
import type { Rubric, ResearchResult } from './researchAgent.js';

export interface ProjectItem {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export type BatchStatus = 'pending' | 'running' | 'done' | 'error';

export interface ProjectBatch {
  index: number;
  itemIds: string[];
  status: BatchStatus;
}

export type ProjectStatus = 'draft' | 'researching' | 'done' | 'error';

export interface Project {
  id: string;
  country: string;
  items: ProjectItem[];
  rubrics: Rubric[];
  status: ProjectStatus;
  batches: ProjectBatch[];
  results: ResearchResult[];
  errorMessage?: string;
  createdAt: string;
}

export interface CreateProjectInput {
  country: string;
  items: Array<{ scriptLine: string; sceneDescription: string }>;
  rubrics: Rubric[];
}

/**
 * In-memory only — state is lost on server restart. A deliberate hackathon-scope
 * tradeoff, not an oversight; see docs/adr/0013.
 */
export interface ProjectStore {
  createProject(input: CreateProjectInput): Project;
  getProject(id: string): Project | undefined;
  listProjects(): Project[];
  updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined;
}

export function createProjectStore(): ProjectStore {
  const projects = new Map<string, Project>();

  return {
    createProject(input) {
      const project: Project = {
        id: randomUUID(),
        country: input.country,
        items: input.items.map((item) => ({ id: randomUUID(), ...item })),
        rubrics: input.rubrics,
        status: 'draft',
        batches: [],
        results: [],
        createdAt: new Date().toISOString(),
      };
      projects.set(project.id, project);
      return project;
    },

    getProject(id) {
      return projects.get(id);
    },

    listProjects() {
      return [...projects.values()];
    },

    updateProject(id, patch) {
      const existing = projects.get(id);
      if (!existing) return undefined;
      const updated: Project = { ...existing, ...patch };
      projects.set(id, updated);
      return updated;
    },
  };
}
