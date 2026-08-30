import { describe, it, expect, vi } from 'vitest';
import { createDiscoveryAgent, type GenAIClient } from './discoveryAgent.js';
import type { SubtitleEntry } from './filmTypes.js';

const CONFIG = { googleCloudProject: 'test-project', geminiLocation: 'us-central1', geminiModel: 'gemini-2.5-flash' };

const ENTRIES: SubtitleEntry[] = [
  { id: 'e1', index: 0, startMs: 1000, endMs: 2000, text: 'Hello there' },
  { id: 'e2', index: 1, startMs: 65000, endMs: 66000, text: 'Second line' },
];

function fakeGenAI(generateContent: GenAIClient['models']['generateContent']): GenAIClient {
  return { models: { generateContent } };
}

describe('createDiscoveryAgent runPass', () => {
  it('sends a fresh video turn when there is no prior conversation, and derives subtitleText for the agent-proposed range', async () => {
    const calls: unknown[] = [];
    const generateContent = vi.fn(async (params: any) => {
      calls.push(params);
      return { text: JSON.stringify({ rows: [{ startMs: 65000, endMs: 66000, segmentDescription: 'A finding' }] }) };
    });

    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: ENTRIES,
      specialInstruction: 'focus on jokes',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });

    expect(result.resultRows).toEqual([
      {
        tempId: expect.any(String),
        startMs: 65000,
        endMs: 66000,
        subtitleText: 'Second line',
        values: { segmentDescription: 'A finding' },
      },
    ]);

    const sentContents = (calls[0] as any).contents;
    expect(sentContents).toHaveLength(1);
    expect(sentContents[0].parts.some((p: any) => p.fileData?.fileUri === 'gs://bucket/clip.mp4')).toBe(true);
  });

  it('accepts a freeform range with no dialogue in it at all — the whole point of docs/adr/0023', async () => {
    const generateContent = vi.fn(async () => ({
      // Falls entirely between the two ENTRIES — no subtitle line overlaps it.
      text: JSON.stringify({ rows: [{ startMs: 10000, endMs: 12000, segmentDescription: 'A visual gag' }] }),
    }));
    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: ENTRIES,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });
    expect(result.resultRows).toEqual([
      {
        tempId: expect.any(String),
        startMs: 10000,
        endMs: 12000,
        subtitleText: '',
        values: { segmentDescription: 'A visual gag' },
      },
    ]);
  });

  it('drops any row with an invalid range (endMs not after startMs, or negative)', async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({
        rows: [
          { startMs: 5000, endMs: 5000, segmentDescription: 'zero-length' },
          { startMs: 5000, endMs: 3000, segmentDescription: 'backwards' },
          { startMs: -100, endMs: 200, segmentDescription: 'negative' },
        ],
      }),
    }));
    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: ENTRIES,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });
    expect(result.resultRows).toHaveLength(0);
  });

  it('routes non-builtin target columns into values.custom', async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ rows: [{ startMs: 1000, endMs: 2000, localSlang: 'yo' }] }),
    }));
    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: ENTRIES,
      specialInstruction: '',
      targetColumns: ['localSlang'],
      priorConversation: [],
    });
    expect(result.resultRows[0].values).toEqual({ custom: { localSlang: 'yo' } });
  });

  it('re-runs append the comment as a new user turn onto the prior conversation, without re-attaching the video', async () => {
    const calls: unknown[] = [];
    const generateContent = vi.fn(async (params: any) => {
      calls.push(params);
      return { text: JSON.stringify({ rows: [] }) };
    });
    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const prior = [
      { role: 'user' as const, parts: [{ text: 'find stuff' }, { fileData: { fileUri: 'gs://x', mimeType: 'video/mp4' } }] },
      { role: 'model' as const, parts: [{ text: '{"rows":[]}' }] },
    ];

    await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: ENTRIES,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: prior,
      newComment: 'look harder at the second half',
    });

    const sentContents = (calls[0] as any).contents;
    expect(sentContents).toHaveLength(3);
    expect(sentContents[2]).toEqual({ role: 'user', parts: [{ text: 'look harder at the second half' }] });
  });

  it('throws when the response was truncated (MAX_TOKENS)', async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"rows":[]}',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    }));
    const agent = createDiscoveryAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    await expect(
      agent.runPass({
        videoUrl: 'gs://bucket/clip.mp4',
        subtitleEntries: ENTRIES,
        specialInstruction: '',
        targetColumns: ['segmentDescription'],
        priorConversation: [],
      }),
    ).rejects.toThrow(/truncated/);
  });
});
