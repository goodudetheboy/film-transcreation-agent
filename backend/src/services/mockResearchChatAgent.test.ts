import { describe, it, expect } from 'vitest';
import { createMockResearchChatAgent } from './mockResearchChatAgent.js';
import { createInMemoryProjectItemStore } from './projectItemStore.js';
import { createInMemoryProjectRubricStore } from './projectRubricStore.js';
import { createInMemoryChatSessionStore } from './chatSessionStore.js';
import type { ChatStreamEvent } from './researchChatAgent.js';

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('createMockResearchChatAgent', () => {
  it('with an item and a rubric present, scripts a real update_rubric_score tool call and persists it', async () => {
    const projectItemStore = createInMemoryProjectItemStore();
    const projectRubricStore = createInMemoryProjectRubricStore();
    const chatSessionStore = createInMemoryChatSessionStore();
    const rubric = await projectRubricStore.createRubric('proj-a', { name: 'Food aversion', description: 'd', weight: 3 });
    const [item] = await projectItemStore.createItems('proj-a', [
      { filmId: 'film-a', detailRowId: 'row-1', startMs: 0, endMs: 1000, subtitleText: 'hello', sceneDescription: 'scene', customValues: {} },
    ]);
    const session = await chatSessionStore.createSession({ projectId: 'proj-a' });

    const agent = createMockResearchChatAgent({ projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'what do you think?', itemId: item.id }));

    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(1);
    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'update_rubric_score', args: { rubricId: rubric.id, score: 8 } });
    expect(events.some((e) => e.type === 'item_patched')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'turn_done' });

    const updated = await projectItemStore.getItem('proj-a', item.id);
    expect(updated?.scores[0]).toMatchObject({ rubricId: rubric.id, score: 8, updatedBy: 'chat-agent' });

    const persisted = await chatSessionStore.getSession('proj-a', session.id);
    expect(persisted?.turns.length).toBeGreaterThan(0);
  });

  it('without an open item, replies asking to open one and does not call any tool', async () => {
    const projectItemStore = createInMemoryProjectItemStore();
    const projectRubricStore = createInMemoryProjectRubricStore();
    const chatSessionStore = createInMemoryChatSessionStore();
    const session = await chatSessionStore.createSession({ projectId: 'proj-a' });

    const agent = createMockResearchChatAgent({ projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
    expect(events[0]).toMatchObject({ type: 'text_delta' });
    expect(events.at(-1)).toEqual({ type: 'turn_done' });
  });
});
