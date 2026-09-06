import { describe, it, expect, vi } from 'vitest';
import { createVideoSegmentDescriber, MAX_CLIP_MS } from './videoSegmentDescriber.js';
import type { GenAIClient } from './discoveryAgent.js';

const CONFIG = { googleCloudProject: 'test-project', geminiLocation: 'us-central1', geminiModel: 'gemini-2.5-flash' };

function fakeGenAI(generateContent: GenAIClient['models']['generateContent']): GenAIClient {
  return { models: { generateContent } };
}

describe('createVideoSegmentDescriber describeVideoSegment', () => {
  it('sends the clipped video part (fileData + videoMetadata offsets) and returns the trimmed description', async () => {
    const calls: unknown[] = [];
    const generateContent = vi.fn(async (params: any) => {
      calls.push(params);
      return { text: '  A red car passes by.  ' };
    });

    const describer = createVideoSegmentDescriber(CONFIG, { genAI: fakeGenAI(generateContent) });
    const result = await describer.describeVideoSegment({
      videoUrl: 'gs://bucket/clip.mp4',
      startMs: 124500,
      endMs: 138200,
      focus: 'what food is on the table',
    });

    expect(result).toBe('A red car passes by.');

    const sentParts = (calls[0] as any).contents[0].parts;
    const videoPart = sentParts.find((p: any) => p.fileData);
    expect(videoPart.fileData).toEqual({ fileUri: 'gs://bucket/clip.mp4', mimeType: 'video/mp4' });
    // floor on start, ceil on end — a fractional-ms range must not clip off
    // real content the caller asked for.
    expect(videoPart.videoMetadata).toEqual({ startOffset: '124s', endOffset: '139s' });
    expect(sentParts.some((p: any) => p.text?.includes('what food is on the table'))).toBe(true);
  });

  it('sends a generic prompt when no focus is given', async () => {
    const generateContent = vi.fn(async () => ({ text: 'Something happens.' }));
    const describer = createVideoSegmentDescriber(CONFIG, { genAI: fakeGenAI(generateContent) });
    await describer.describeVideoSegment({ videoUrl: 'gs://bucket/clip.mp4', startMs: 0, endMs: 1000 });

    const sentParts = generateContent.mock.calls[0][0].contents[0].parts as any[];
    expect(sentParts.some((p) => p.text === 'Describe this clip.')).toBe(true);
  });

  it('rejects endMs <= startMs without calling the model', async () => {
    const generateContent = vi.fn();
    const describer = createVideoSegmentDescriber(CONFIG, { genAI: fakeGenAI(generateContent) });

    await expect(describer.describeVideoSegment({ videoUrl: 'gs://bucket/clip.mp4', startMs: 5000, endMs: 5000 })).rejects.toThrow(
      'endMs must be greater than startMs',
    );
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects a clip longer than MAX_CLIP_MS without calling the model', async () => {
    const generateContent = vi.fn();
    const describer = createVideoSegmentDescriber(CONFIG, { genAI: fakeGenAI(generateContent) });

    await expect(
      describer.describeVideoSegment({ videoUrl: 'gs://bucket/clip.mp4', startMs: 0, endMs: MAX_CLIP_MS + 1 }),
    ).rejects.toThrow('clip too long');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('throws if the model returns an empty response', async () => {
    const generateContent = vi.fn(async () => ({ text: '   ' }));
    const describer = createVideoSegmentDescriber(CONFIG, { genAI: fakeGenAI(generateContent) });

    await expect(describer.describeVideoSegment({ videoUrl: 'gs://bucket/clip.mp4', startMs: 0, endMs: 1000 })).rejects.toThrow(
      'empty response',
    );
  });
});
