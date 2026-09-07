import { describe, it, expect, vi } from 'vitest';
import { createResearchChatAgent, type ChatGenAIClient, type ChatStreamEvent } from './researchChatAgent.js';
import { createInMemoryProjectItemStore } from './projectItemStore.js';
import { createInMemoryProjectRubricStore } from './projectRubricStore.js';
import { createInMemoryChatSessionStore } from './chatSessionStore.js';
import { createInMemoryResearchRunStore } from './researchRunStore.js';
import { createInMemoryFilmStore } from './filmStore.js';
import type { VideoSegmentDescriber } from './videoSegmentDescriber.js';
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
  const researchRunStore = createInMemoryResearchRunStore();
  const filmStore = createInMemoryFilmStore();
  const videoSegmentDescriber: VideoSegmentDescriber = { describeVideoSegment: vi.fn(async () => 'a description of what is happening') };
  const rubric = await projectRubricStore.createRubric('proj-a', { name: 'Food aversion', description: 'd', weight: 3 , trendEligible: false });
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
  return { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, rubric, item, session };
}

describe('createResearchChatAgent runTurn', () => {
  it('a text-only turn yields text_delta then turn_done, with no tool calls', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'Hello there.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'text_delta', text: 'Hello there.' }, { type: 'turn_done' }]);
    expect(generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('includes the target country in the system instruction when passed', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'Sure.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    await collect(agent.runTurn({ session, userText: 'hi', country: 'Japan' }));

    const call = generateContentStream.mock.calls[0][0] as { config: { systemInstruction: string } };
    expect(call.config.systemInstruction).toContain('TARGET COUNTRY: Japan');

    const persisted = await chatSessionStore.getSession('proj-a', session.id);
    expect(persisted?.turns.map((t) => t.role)).toEqual(['user', 'model']);
  });

  it('a single-tool-call turn calls the tool, emits tool_call/tool_result/item_patched, then makes a second round for the final text', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, rubric, item, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'update_rubric_score', args: { rubricId: rubric.id, score: 8 } } }] } }] }]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Updated it to 8.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'bump the score', itemId: item.id }));

    expect(generateContentStream).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'item_patched', 'text_delta', 'turn_done']);
    expect(events[0]).toMatchObject({ type: 'tool_call', name: 'update_rubric_score', args: { rubricId: rubric.id, score: 8 } });
    expect(events[1]).toMatchObject({ type: 'tool_result', name: 'update_rubric_score', result: { ok: true, score: 8 } });
    expect(events[2]).toMatchObject({ type: 'item_patched', itemId: item.id, rubricId: rubric.id });

    const updatedItem = await projectItemStore.getItem('proj-a', item.id);
    expect(updatedItem?.scores[0]).toMatchObject({ rubricId: rubric.id, score: 8, updatedBy: 'chat-agent' });
  });

  it('update_assessment sets shouldTranscreate/summary and emits item_patched', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, item, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'update_assessment',
                        args: { shouldTranscreate: false, summary: 'Reads fine locally, no change needed.' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Marked as fine as-is.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'what do you think?', itemId: item.id }));

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'item_patched', 'text_delta', 'turn_done']);
    expect(events[1]).toMatchObject({
      type: 'tool_result',
      name: 'update_assessment',
      result: { ok: true, shouldTranscreate: false, summary: 'Reads fine locally, no change needed.' },
    });
    expect(events[2]).toMatchObject({
      type: 'item_patched',
      itemId: item.id,
      patch: { shouldTranscreate: false, summary: 'Reads fine locally, no change needed.' },
    });

    const updatedItem = await projectItemStore.getItem('proj-a', item.id);
    expect(updatedItem?.shouldTranscreate).toBe(false);
    expect(updatedItem?.summary).toBe('Reads fine locally, no change needed.');
  });

  it('a multi-round tool-calling turn (two sequential tool calls) persists turns after every round', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, rubric, item, session } = await buildDeps();
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

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
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

  it('yields only a stopped event and never calls the model when the signal is already aborted', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const controller = new AbortController();
    controller.abort();
    const generateContentStream = vi.fn();
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'hi', signal: controller.signal }));

    expect(events).toEqual([{ type: 'stopped' }]);
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('yields a stopped event (not error) when the stream call itself rejects with an AbortError', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const generateContentStream = vi.fn().mockRejectedValue(abortError);
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'stopped' }]);
  });

  it('yields an error event and does not throw when the underlying stream call rejects', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const generateContentStream = vi.fn().mockRejectedValue(new Error('vertex boom'));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'error', message: 'vertex boom' }]);
  });

  it('update_rubric_score returns an error result (not a throw) when no itemId is open', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, rubric, session } = await buildDeps();
    const generateContentStream = vi.fn(async () =>
      streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'update_rubric_score', args: { rubricId: rubric.id, score: 5 } } }] } }] }]),
    );
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'go' })); // no itemId

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('no item is currently open') } });
    expect(events.some((e) => e.type === 'item_patched')).toBe(false);
  });

  it('persists `run` marker turns but excludes them from what is sent to Gemini, and summarizes the run in context', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const run = await researchRunStore.createRun({
      projectId: 'proj-a',
      mode: 'need-research',
      itemIds: ['item-1', 'item-2'],
      rubricIds: [],
      testMode: true,
    });
    await researchRunStore.updateRun('proj-a', run.id, { status: 'done', totalBatches: 1, completedBatches: 1 });
    await chatSessionStore.updateSession('proj-a', session.id, {
      turns: [{ role: 'system', parts: [{ run: { runId: run.id } }], ts: new Date().toISOString() }],
    });
    const sessionWithRun = (await chatSessionStore.getSession('proj-a', session.id))!;

    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    await collect(agent.runTurn({ session: sessionWithRun, userText: 'how did that run go?' }));

    const call = generateContentStream.mock.calls[0][0] as { contents: Array<{ role: string }>; config: { systemInstruction: string } };
    expect(call.contents.map((t) => t.role)).toEqual(['user']);
    expect(call.config.systemInstruction).toContain(run.id);
    expect(call.config.systemInstruction).toContain('1/1 batches complete');

    const persisted = await chatSessionStore.getSession('proj-a', session.id);
    expect(persisted?.turns.map((t) => t.role)).toEqual(['system', 'user', 'model']);
  });

  it("describe_video_segment calls the describer with the film's videoUrl and returns the description", async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber } = await buildDeps();
    const film = await filmStore.createFilm({ title: 'Test Film', videoUrl: 'gs://bucket/clip.mp4', subtitle: null, runDiscoveryOnCreate: false });
    const session = await chatSessionStore.createSession({ projectId: 'proj-a' });

    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { candidates: [{ content: { parts: [{ functionCall: { name: 'describe_video_segment', args: { startMs: 2000, endMs: 5000, focus: 'food' } } }] } }] },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'I saw a red car.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'what is happening at 2s?', filmId: film.id }));

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'text_delta', 'turn_done']);
    expect(videoSegmentDescriber.describeVideoSegment).toHaveBeenCalledWith({ videoUrl: 'gs://bucket/clip.mp4', startMs: 2000, endMs: 5000, focus: 'food' });
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { description: 'a description of what is happening' } });
  });

  it('describe_video_segment rejects a too-long range without calling the describer', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'describe_video_segment', args: { startMs: 0, endMs: 120000 } } }] } }] }]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Cannot do that.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'describe a huge range', filmId: 'film-a' }));

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('clip too long') } });
    expect(videoSegmentDescriber.describeVideoSegment).not.toHaveBeenCalled();
  });
});

describe('createResearchChatAgent runTurn — search_web', () => {
  it('calls Parallel directly via fetchImpl and surfaces the real query/results through tool_call/tool_result', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
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
      { genAI, fetchImpl: fetchImpl as unknown as typeof fetch, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber },
    );
    const events = await collect(agent.runTurn({ session, userText: 'is this gesture rude in Japan?' }));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall).toMatchObject({ name: 'search_web', args: { search_queries: ['q1'] } });
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ name: 'search_web', result: { search_id: 'sid', results: [{ url: 'https://x.com' }] } });
  });

  it('returns an error result when no Parallel API key is configured', async () => {
    const { projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber, session } = await buildDeps();
    const generateContentStream = vi.fn(async () =>
      streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'search_web', args: { search_queries: ['q1'] } } }] } }] }]),
    );
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createResearchChatAgent(CONFIG, { genAI, projectItemStore, projectRubricStore, chatSessionStore, researchRunStore, filmStore, videoSegmentDescriber });
    const events = await collect(agent.runTurn({ session, userText: 'search please' }));

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('Parallel API key') } });
  });
});
