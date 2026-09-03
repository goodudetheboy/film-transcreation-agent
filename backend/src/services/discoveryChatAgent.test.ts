import { describe, it, expect, vi } from 'vitest';
import { createDiscoveryChatAgent, type ChatGenAIClient, type DiscoveryChatStreamEvent } from './discoveryChatAgent.js';
import { createInMemoryDetailRowsStore } from './detailRowsStore.js';
import { createInMemoryDiscoveryJobStore } from './discoveryJobStore.js';
import { createInMemoryDiscoveryChatSessionStore } from './discoveryChatSessionStore.js';
import { createDiscoveryEventBus } from './discoveryEventBus.js';

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

async function collect(gen: AsyncGenerator<DiscoveryChatStreamEvent>): Promise<DiscoveryChatStreamEvent[]> {
  const events: DiscoveryChatStreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

async function buildDeps() {
  const detailRowsStore = createInMemoryDetailRowsStore();
  const discoveryJobStore = createInMemoryDiscoveryJobStore();
  const discoveryChatSessionStore = createInMemoryDiscoveryChatSessionStore();
  const eventBus = createDiscoveryEventBus();

  const row = await detailRowsStore.addRow('film-a', {
    startMs: 0,
    endMs: 1000,
    subtitleText: 'hello there',
    values: { segmentDescription: 'a scene', gesture: '', notes: '' },
    provenance: { type: 'user-marked' },
  });

  const session = await discoveryChatSessionStore.createSession({ filmId: 'film-a' });

  const job = await discoveryJobStore.createJob({
    filmId: 'film-a',
    agentNumber: session.agentNumber,
    specialInstruction: '',
    targetColumns: ['segmentDescription'],
    testMode: true,
  });
  const jobWithCandidate = await discoveryJobStore.updateJob('film-a', job.id, {
    status: 'done',
    resultRows: [{ tempId: 'cand-1', startMs: 2000, endMs: 3000, subtitleText: 'a new line', values: { segmentDescription: 'new' } }],
  });

  return { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, row, session, job: jobWithCandidate! };
}

describe('createDiscoveryChatAgent runTurn', () => {
  it('a text-only turn yields text_delta then turn_done, with no tool calls', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, session } = await buildDeps();
    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'Hello there.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'text_delta', text: 'Hello there.' }, { type: 'turn_done' }]);
    expect(generateContentStream).toHaveBeenCalledTimes(1);

    const persisted = await discoveryChatSessionStore.getSession('film-a', session.id);
    expect(persisted?.turns.map((t) => t.role)).toEqual(['user', 'model']);
  });

  it('edit_detail_row calls the tool, emits tool_call/tool_result/row_patched, applies immediately', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, row, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { candidates: [{ content: { parts: [{ functionCall: { name: 'edit_detail_row', args: { rowId: row.id, field: 'notes', value: 'flagged' } } }] } }] },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Updated the notes.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'flag that row', }));

    expect(generateContentStream).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'row_patched', 'text_delta', 'turn_done']);
    expect(events[0]).toMatchObject({ type: 'tool_call', name: 'edit_detail_row' });
    expect(events[2]).toMatchObject({ type: 'row_patched', row: { id: row.id } });

    const updatedRow = await detailRowsStore.updateRow('film-a', row.id, {});
    expect(updatedRow?.values.notes).toBe('flagged');
  });

  it('edit_detail_row rejects an unsupported field without touching the row', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, row, session } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([{ candidates: [{ content: { parts: [{ functionCall: { name: 'edit_detail_row', args: { rowId: row.id, field: 'startMs', value: '5000' } } }] } }] }]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Cannot do that.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'move it' }));

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toMatchObject({ result: { error: expect.stringContaining('field must be one of') } });
    expect(events.some((e) => e.type === 'row_patched')).toBe(false);
  });

  it('merge_candidate_row adds the candidate to the Details table and emits row_added', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, session, job } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { candidates: [{ content: { parts: [{ functionCall: { name: 'merge_candidate_row', args: { jobId: job.id, tempId: 'cand-1' } } }] } }] },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Added it.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };
    const busEvents: unknown[] = [];
    eventBus.subscribe(`discoveryJob:${job.id}`, (e) => busEvents.push(e));

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'add that candidate' }));

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'row_added', 'text_delta', 'turn_done']);
    const rowAdded = events.find((e) => e.type === 'row_added') as Extract<DiscoveryChatStreamEvent, { type: 'row_added' }>;
    expect(rowAdded.row.subtitleText).toBe('a new line');

    const rows = await detailRowsStore.listRows('film-a');
    expect(rows.some((r) => r.subtitleText === 'a new line')).toBe(true);
    const updatedJob = await discoveryJobStore.getJob('film-a', job.id);
    expect(updatedJob?.resultRows).toHaveLength(0);
    expect(busEvents).toHaveLength(1);
  });

  it('discard_candidate_row removes the candidate without touching the Details table', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, session, job } = await buildDeps();
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { candidates: [{ content: { parts: [{ functionCall: { name: 'discard_candidate_row', args: { jobId: job.id, tempId: 'cand-1' } } }] } }] },
        ]),
      )
      .mockResolvedValueOnce(streamOf([{ candidates: [{ content: { parts: [{ text: 'Discarded it.' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'discard that one' }));

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'row_discarded', 'text_delta', 'turn_done']);

    const rows = await detailRowsStore.listRows('film-a');
    expect(rows.some((r) => r.subtitleText === 'a new line')).toBe(false);
    const updatedJob = await discoveryJobStore.getJob('film-a', job.id);
    expect(updatedJob?.resultRows).toHaveLength(0);
  });

  it('persists `run` marker turns but excludes them from what is sent to Gemini', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, session, job } = await buildDeps();
    await discoveryChatSessionStore.updateSession('film-a', session.id, {
      turns: [{ role: 'system', parts: [{ run: { jobId: job.id } }], ts: new Date().toISOString() }],
    });
    const sessionWithRun = (await discoveryChatSessionStore.getSession('film-a', session.id))!;

    const generateContentStream = vi.fn(async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }]));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    await collect(agent.runTurn({ session: sessionWithRun, userText: 'how did that run go?' }));

    const sentContents = generateContentStream.mock.calls[0][0].contents as Array<{ role: string }>;
    expect(sentContents.map((t) => t.role)).toEqual(['user']);

    const persisted = await discoveryChatSessionStore.getSession('film-a', session.id);
    expect(persisted?.turns.map((t) => t.role)).toEqual(['system', 'user', 'model']);
  });

  it('yields an error event and does not throw when the underlying stream call rejects', async () => {
    const { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, session } = await buildDeps();
    const generateContentStream = vi.fn().mockRejectedValue(new Error('vertex boom'));
    const genAI: ChatGenAIClient = { models: { generateContentStream } };

    const agent = createDiscoveryChatAgent(CONFIG, { genAI, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });
    const events = await collect(agent.runTurn({ session, userText: 'hi' }));

    expect(events).toEqual([{ type: 'error', message: 'vertex boom' }]);
  });
});
