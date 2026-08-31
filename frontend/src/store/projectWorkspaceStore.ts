import { create } from 'zustand';
import type {
  ChatSession,
  ChatStreamEvent,
  EnrichedProject,
  Project,
  ProjectItem,
  ResearchRunStreamEvent,
  Rubric,
} from '../api/apiClient.types';

export type ProjectItemFilter = 'all' | 'accepted' | 'pending' | 'rejected' | 'need-research';
export type ProjectSortBy = 'importanceScore' | 'startMs';
export type RunStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface ProjectWorkspaceState {
  project: (Project & Partial<EnrichedProject>) | null;
  rubrics: Rubric[];
  items: Record<string, ProjectItem>;
  activeRunId: string | null;
  runStatus: RunStatus;
  runError: string | null;
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  filter: ProjectItemFilter;
  sortBy: ProjectSortBy;

  setProject: (project: Project & Partial<EnrichedProject>) => void;
  setRubrics: (rubrics: Rubric[]) => void;
  addRubric: (rubric: Rubric) => void;
  updateRubricInPlace: (rubric: Rubric) => void;
  removeRubric: (rubricId: string) => void;
  setItems: (items: ProjectItem[]) => void;
  addItems: (items: ProjectItem[]) => void;
  patchItem: (itemId: string, patch: Partial<ProjectItem>) => void;
  removeItem: (itemId: string) => void;
  startRun: (runId: string) => void;
  applyRunEvent: (event: ResearchRunStreamEvent) => void;
  setChatSessions: (sessions: ChatSession[]) => void;
  addChatSession: (session: ChatSession) => void;
  setActiveChatSessionId: (id: string | null) => void;
  applyChatEvent: (event: ChatStreamEvent) => void;
  setFilter: (filter: ProjectItemFilter) => void;
  setSort: (sortBy: ProjectSortBy) => void;
  reset: () => void;
}

const initialState = {
  project: null as (Project & Partial<EnrichedProject>) | null,
  rubrics: [] as Rubric[],
  items: {} as Record<string, ProjectItem>,
  activeRunId: null as string | null,
  runStatus: 'idle' as RunStatus,
  runError: null as string | null,
  chatSessions: [] as ChatSession[],
  activeChatSessionId: null as string | null,
  filter: 'all' as ProjectItemFilter,
  sortBy: 'importanceScore' as ProjectSortBy,
};

export const useProjectWorkspaceStore = create<ProjectWorkspaceState>((set, get) => ({
  ...initialState,

  setProject: (project) => set({ project }),
  setRubrics: (rubrics) => set({ rubrics }),
  addRubric: (rubric) => set({ rubrics: [...get().rubrics, rubric] }),
  updateRubricInPlace: (rubric) => set({ rubrics: get().rubrics.map((r) => (r.id === rubric.id ? rubric : r)) }),
  removeRubric: (rubricId) => set({ rubrics: get().rubrics.filter((r) => r.id !== rubricId) }),

  setItems: (items) => set({ items: Object.fromEntries(items.map((i) => [i.id, i])) }),
  addItems: (newItems) => set({ items: { ...get().items, ...Object.fromEntries(newItems.map((i) => [i.id, i])) } }),

  patchItem: (itemId, patch) => {
    const current = get().items[itemId];
    if (!current) return;
    set({ items: { ...get().items, [itemId]: { ...current, ...patch } } });
  },

  removeItem: (itemId) => {
    const items = { ...get().items };
    delete items[itemId];
    set({ items });
  },

  startRun: (runId) => set({ activeRunId: runId, runStatus: 'streaming', runError: null }),

  applyRunEvent: (event) => {
    if (event.type === 'batch_done') {
      const items = { ...get().items };
      for (const result of event.results) {
        const current = items[result.itemId];
        if (!current) continue;
        items[result.itemId] = {
          ...current,
          scores: result.scores,
          summary: result.summary,
          shouldTranscreate: result.shouldTranscreate,
          suggestedReplacement: result.suggestedReplacement ?? null,
          lastResearchedAt: new Date().toISOString(),
        };
      }
      set({ items });
    } else if (event.type === 'done') {
      set({ runStatus: 'done' });
    } else if (event.type === 'error') {
      set({ runStatus: 'error', runError: event.message });
    }
  },

  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  addChatSession: (session) => set({ chatSessions: [...get().chatSessions, session], activeChatSessionId: session.id }),
  setActiveChatSessionId: (id) => set({ activeChatSessionId: id }),

  applyChatEvent: (event) => {
    if (event.type !== 'item_patched') return;
    const current = get().items[event.itemId];
    if (!current) return;

    if (event.rubricId) {
      const patch = event.patch as { score?: number; reasoning?: string; evidence?: string; sources?: string[]; importanceScore?: number | null };
      const existing = current.scores.find((s) => s.rubricId === event.rubricId);
      const now = new Date().toISOString();
      const mergedScore = {
        rubricId: event.rubricId,
        score: patch.score ?? existing?.score ?? 0,
        reasoning: patch.reasoning ?? existing?.reasoning ?? '',
        evidence: patch.evidence ?? existing?.evidence ?? '',
        sources: patch.sources ?? existing?.sources ?? [],
        userNote: existing?.userNote,
        updatedAt: now,
        updatedBy: 'chat-agent' as const,
      };
      const scores = existing
        ? current.scores.map((s) => (s.rubricId === event.rubricId ? mergedScore : s))
        : [...current.scores, mergedScore];
      get().patchItem(event.itemId, {
        scores,
        importanceScore: patch.importanceScore !== undefined ? patch.importanceScore : current.importanceScore,
      });
    } else {
      get().patchItem(event.itemId, event.patch as Partial<ProjectItem>);
    }
  },

  setFilter: (filter) => set({ filter }),
  setSort: (sortBy) => set({ sortBy }),

  reset: () => set({ ...initialState }),
}));
