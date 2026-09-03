import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectWorkspaceStore } from './projectWorkspaceStore';
import type { ChatSession, ChatStreamEvent, Project, ProjectItem, ResearchRunStreamEvent } from '../api/apiClient.types';

const NOW = new Date().toISOString();

function project(): Project {
  return { id: 'proj-a', name: 'Japan', country: 'Japan', sourceFilmId: 'film-a', note: '', status: 'draft', createdAt: NOW, updatedAt: NOW };
}

function item(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: 'item-1',
    projectId: 'proj-a',
    filmId: 'film-a',
    detailRowId: 'row-1',
    startMs: 0,
    endMs: 1000,
    subtitleText: 'hello',
    sceneDescription: 'scene',
    customValues: {},
    action: 'pending',
    importanceScore: null,
    scores: [],
    summary: null,
    shouldTranscreate: null,
    suggestedReplacement: null,
    trendSuggestions: null,
    lastResearchedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  useProjectWorkspaceStore.getState().reset();
});

describe('useProjectWorkspaceStore', () => {
  it('setProject/setItems/setRubrics populate state; items are keyed by id', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setProject(project());
    store.setItems([item(), item({ id: 'item-2' })]);

    const state = useProjectWorkspaceStore.getState();
    expect(state.project?.id).toBe('proj-a');
    expect(Object.keys(state.items).sort()).toEqual(['item-1', 'item-2']);
  });

  it('patchItem merges a partial patch onto an existing item, no-ops for an unknown id', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setItems([item()]);
    store.patchItem('item-1', { action: 'accepted' });
    expect(useProjectWorkspaceStore.getState().items['item-1'].action).toBe('accepted');

    store.patchItem('does-not-exist', { action: 'rejected' });
    expect(useProjectWorkspaceStore.getState().items['does-not-exist']).toBeUndefined();
  });

  it('applyRunEvent(batch_done) merges each result onto its matching item', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setItems([item({ id: 'item-1' })]);

    const event: ResearchRunStreamEvent = {
      type: 'batch_done',
      batchIndex: 0,
      totalBatches: 1,
      itemIds: ['item-1'],
      results: [
        {
          itemId: 'item-1',
          targetCountry: 'Japan',
          scores: [{ rubricId: 'r1', score: 9, reasoning: 'x', evidence: 'y', sources: [], updatedAt: NOW, updatedBy: 'batch-agent' }],
          summary: 'should change',
          shouldTranscreate: true,
          suggestedReplacement: { text: 'new', justification: 'because' },
        },
      ],
    };
    store.applyRunEvent(event);

    const updated = useProjectWorkspaceStore.getState().items['item-1'];
    expect(updated.summary).toBe('should change');
    expect(updated.shouldTranscreate).toBe(true);
    expect(updated.scores).toHaveLength(1);
  });

  it('applyRunEvent(done/error) updates runStatus/runError', () => {
    const store = useProjectWorkspaceStore.getState();
    store.applyRunEvent({ type: 'done', summary: { totalItems: 1, totalRecommendedForChange: 0 } });
    expect(useProjectWorkspaceStore.getState().runStatus).toBe('done');

    store.applyRunEvent({ type: 'error', message: 'boom' });
    const state = useProjectWorkspaceStore.getState();
    expect(state.runStatus).toBe('error');
    expect(state.runError).toBe('boom');
  });

  it('applyChatEvent(item_patched) with a rubricId upserts one score entry and updates importanceScore', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setItems([item({ id: 'item-1' })]);

    const event: ChatStreamEvent = {
      type: 'item_patched',
      itemId: 'item-1',
      rubricId: 'r1',
      patch: { score: 8, reasoning: 'strong match', importanceScore: 8 },
    };
    store.applyChatEvent(event);

    const updated = useProjectWorkspaceStore.getState().items['item-1'];
    expect(updated.scores).toEqual([
      expect.objectContaining({ rubricId: 'r1', score: 8, reasoning: 'strong match', updatedBy: 'chat-agent' }),
    ]);
    expect(updated.importanceScore).toBe(8);

    // A second patch to the same rubric merges rather than duplicating.
    store.applyChatEvent({ type: 'item_patched', itemId: 'item-1', rubricId: 'r1', patch: { reasoning: 'revised' } });
    const updatedAgain = useProjectWorkspaceStore.getState().items['item-1'];
    expect(updatedAgain.scores).toHaveLength(1);
    expect(updatedAgain.scores[0]).toMatchObject({ score: 8, reasoning: 'revised' });
  });

  it('applyChatEvent(item_patched) without a rubricId applies a top-level patch (e.g. propose_replacement)', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setItems([item({ id: 'item-1' })]);

    store.applyChatEvent({
      type: 'item_patched',
      itemId: 'item-1',
      patch: { suggestedReplacement: { text: 'new line', justification: 'because' }, shouldTranscreate: true },
    });

    const updated = useProjectWorkspaceStore.getState().items['item-1'];
    expect(updated.suggestedReplacement).toEqual({ text: 'new line', justification: 'because' });
    expect(updated.shouldTranscreate).toBe(true);
  });

  it('applyChatEvent ignores non-item_patched events', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setItems([item({ id: 'item-1' })]);
    store.applyChatEvent({ type: 'text_delta', text: 'hi' });
    expect(useProjectWorkspaceStore.getState().items['item-1']).toEqual(item({ id: 'item-1' }));
  });

  it('upsertChatSession adds a new session or replaces an existing one by id, and sets it active', () => {
    const store = useProjectWorkspaceStore.getState();
    const session: ChatSession = { id: 's1', projectId: 'proj-a', name: null, sessionNumber: 1, status: 'idle', turns: [], createdAt: NOW, updatedAt: NOW };

    store.upsertChatSession(session);
    expect(useProjectWorkspaceStore.getState().chatSessions).toEqual([session]);
    expect(useProjectWorkspaceStore.getState().activeChatSessionId).toBe('s1');

    const updated: ChatSession = { ...session, turns: [{ role: 'system', parts: [{ run: { runId: 'run-1' } }], ts: NOW }] };
    store.upsertChatSession(updated);
    expect(useProjectWorkspaceStore.getState().chatSessions).toEqual([updated]);
  });

  it('setFilter/setSort update UI-only state', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setFilter('accepted');
    store.setSort('startMs');
    const state = useProjectWorkspaceStore.getState();
    expect(state.filter).toBe('accepted');
    expect(state.sortBy).toBe('startMs');
  });

  it('reset clears everything back to initial state', () => {
    const store = useProjectWorkspaceStore.getState();
    store.setProject(project());
    store.setItems([item()]);
    store.setFilter('rejected');
    store.reset();

    const state = useProjectWorkspaceStore.getState();
    expect(state.project).toBeNull();
    expect(state.items).toEqual({});
    expect(state.filter).toBe('all');
  });
});
