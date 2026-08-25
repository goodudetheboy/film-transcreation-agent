import { create } from 'zustand';
import type { Project, ResearchResult, ResearchStreamEvent } from '../api/apiClient.types';

export type ResearchStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface BatchProgress {
  batchIndex: number;
  totalBatches: number;
}

export interface ProjectState {
  currentProject: Project | null;
  researchStatus: ResearchStatus;
  batchProgress: BatchProgress | null;
  itemResults: Record<string, ResearchResult>;
  errorMessage: string | null;
  setCurrentProject: (project: Project) => void;
  startResearch: () => void;
  applyEvent: (event: ResearchStreamEvent) => void;
  reset: () => void;
}

const initialState = {
  currentProject: null as Project | null,
  researchStatus: 'idle' as ResearchStatus,
  batchProgress: null as BatchProgress | null,
  itemResults: {} as Record<string, ResearchResult>,
  errorMessage: null as string | null,
};

function statusFromProject(project: Project): ResearchStatus {
  if (project.status === 'researching') return 'streaming';
  if (project.status === 'done') return 'done';
  if (project.status === 'error') return 'error';
  return 'idle';
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialState,

  setCurrentProject: (project) => {
    const itemResults: Record<string, ResearchResult> = {};
    for (const r of project.results) itemResults[r.itemId] = r;
    set({
      currentProject: project,
      itemResults,
      researchStatus: statusFromProject(project),
      batchProgress: null,
      errorMessage: project.errorMessage ?? null,
    });
  },

  startResearch: () => set({ researchStatus: 'streaming', batchProgress: null, errorMessage: null }),

  applyEvent: (event) => {
    if (event.type === 'batch_done') {
      const itemResults = { ...get().itemResults };
      for (const r of event.results) itemResults[r.itemId] = r;
      set({
        itemResults,
        batchProgress: { batchIndex: event.batchIndex, totalBatches: event.totalBatches },
      });
    } else if (event.type === 'done') {
      set({ researchStatus: 'done' });
    } else if (event.type === 'error') {
      set({ researchStatus: 'error', errorMessage: event.message });
    }
  },

  reset: () => set({ ...initialState }),
}));
