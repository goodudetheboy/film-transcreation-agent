import { describe, it, expect, vi } from 'vitest';
import { createResearchChatAgent, type ChatGenAIClient, type ChatStreamEvent } from './researchChatAgent.js';
import { createInMemoryProjectItemStore } from './projectItemStore.js';
import { createInMemoryProjectRubricStore } from './projectRubricStore.js';
import { createInMemoryChatSessionStore } from './chatSessionStore.js';
import type { ChatSession } from './projectTypes.js';

const CONFIG = { googleCloudProject: 'test-project', geminiLocation: 'us-central1', geminiModel: 'gemini-2.5-flash' };

type Chunk = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> };
    finishReason?: string;
  }>;
};

function streamOf(chunks: Chunk[]): AsyncIterable<Chunk> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvit[]> {
  const events: ChatStreamEvit[] = [];
  for await (const e of gen) events.push(e);
  return events;
}
type ChatStreamEvit = ChatStreamEvent;

async function buildDeps() {
  const projectItemStore = createInMemoryProjectItemStore();
  const projectRubricStore = createInMemoryProjectRubricStore();
  const chatSessionStore = createInMemoryChatSessionStore();
  const rubric = await projectRubricStore.createRubric('proj-a', { name: 'Food aversion', description: 'd', weight: 3 });
  const [item] = await projectItemStore.createItems('proj-a', [
    {
      filmId: 'film-a',
      detailRowId: 'row-1',
      startMs: 0,
      endMs: 1000,
      subtitleText: 'hello',
      sceneDescription: 'a scene',
      customValues: {},
    },
  ]);
  const session = await chatSessionStore.createSession({ projectId: 'proj-a' });
  return { projectItemStore, projectRubricStore, chatSessionStore, rubric, item, session };
}

describe('createResearchChatAgent runTurn', () => {
  it('a text-only turn yields text_delta then turn_done, with no tool calls', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, session } = await buildDeps();
    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'Hello there.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'text_delta', text: 'Hello there.' }, { type: 'turn_done' }]);
    expect(generateContentStream).toHaveBeenCalledTimes(1);

    const persisted = await chatSessionStore.getSession('proj-a', session.id);
    expect(persisted?.turns.map((t) => t.role)).toEqual(['user', 'model']);
  });

  it('a single-tool-call turn calls the tool, emits tool_call/tool_result/item_patched, then makes a second round for the final text', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, rubric, item, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'update_rubric_score', args: { rubricId: rubric.id, score: 8 } } }] } }] }]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Updated it to 8.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'bump the score', itemId: item.id }));

    expect(generateContentStream).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'item_patched', 'text_delta', 'turn_done']);
    expect(events[0]).toMatchObject({ type: 'tool_call', name: 'update_rubric_score', args: { rubricId: rubric.id, score: 8 } });
    expect(events[1]).toMatchObject({ type: 'tool_result', name: 'update_rubric_score', result: { ok: true, score: 8 } });
    expect(events[2]).toMatchObject({ type: 'item_patched', itemId: item.id, rubricId: rubric.id });

    const updatedItem = await projectItemStore.getItem('proj-a', item.id);
    expect(updatedItem?.scores[0]).toMatchObject({ rubricId: rubric.id, score: 8, updatedBy: 'chat-agent' });
  });

  it('a multi-round tool-calling turn (two sequential tool calls) persists turns after every round', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, rubric, item, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'update_rubric_score', args: { rubricId: rubric.id, score: 6 } } }] } }] }]),
      )
      .mockResolvedValueOnce(
        streamOf([
          {
            candidates: [
              { content: { parts: [{ functionCall: { name: 'propose_replacement', args: { text: 'new line', justification: 'because' } } }] } },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Done.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'go', itemId: item.id }));

    expect(generateContentStream).toHaveBeenCalledTimes(3);
    const toolCallNames = events.filter((e) => e.type === 'tool_call').map((e) => (e as { name: string }).name);
    expect(toolCallNames).toEqual(['update_rubric_score', 'propose_replacement']);
    expect(events.at(-1)).toEqual({ type: 'turn_done' });

    const persisted = await chatSessionStore.getSession('proj-a', session.id);
    // user + model(call1) + functionResponse(call1) + model(call2) + functionResponse(call2) + model(text)
    expect(persisted?.turns).toHaveLength(6);

    const updatedItem = await projectItemStore.getItem('proj-a', item.id);
    expect(updatedItem?.suggestedReplacement).toEqual({ text: 'new line', justification: 'because' });
    expect(updatedItem?.shouldTranscreate).toBe(true);
  });

  it('yields an error event and does not throw when the underlying stream call rejects', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, session } = await buildDeps();
    const generateContentStream = vi.fn().mockRejectedValue(new Error('vertex boom'));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'error', message: 'vertex boom' }]);
  });

  it('update_rubric_score returns an error result (not a throw) when no itemId is open', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, rubric, session } = await buildDeps();
    const generateContentStream = vi.fn(async () =>
      streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'update_rubric_score', args: { rubricId: rubric.id, score: 5 } } }] } }] }]),
    );
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'go' })); // no itemId

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('no item is currently open') } });
    expect(events.some((e) => e.type === 'item_patched')).toBe(false);
  });
});

describe('createResearchChatAgent runTurn — search_web', () => {
  it('calls Parallel directly via fetchImpl and surfaces the real query/results through tool_call/tool_result', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { candidates: [{ content: { parts: [{ functionCall: { name: 'search_web', args: { objective: 'check gesture', search_queries: ['q1'] } } }] } }] },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Found it.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.parallel.ai/v1/search');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ objective: 'check gesture', search_queries: ['q1'] });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ search_id: 'sid', results: [{ url: 'https://x.com', title: 't', excerpts: ['e'] }] }),
        text: async () => '',
      } as Response;
    });

    const agent = createResearchChatAgent(
      { ...CONFIG, parallelApiKey: 'test-key' },
      { genAI, fetchImpl: fetchImpl as unknown as typeof fetch, projectItemStore, projectRubricStore, chatSessionStore },
    );
    const events = await collect(agent.runTurn({ session, userText: 'is this gesture rude in Japan?' }));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall).toMatchObject({ name: 'search_web', args: { search_queries: ['q1'] } });
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ name: 'search_web', result: { search_id: 'sid', results: [{ url: 'https://x.com' }] } });
  });

  it('returns an error result when no Parallel API key is configured', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, session } = await buildDeps();
    const generateContentStream = vi.fn(async () =>
      streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'search_web', args: { search_queries: ['q1'] } } }] } }] }]),
    );
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore });
    const events = await collect(agent.runTurn({ session, userText: 'search please' }));

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('Parallel API key') } });
  });
});
