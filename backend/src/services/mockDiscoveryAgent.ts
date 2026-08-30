import { randomUUID } from 'node:crypto';
import type { DiscoveryAgent, DiscoveryPassInput, DiscoveryPassResult } from './discoveryAgent.js';
import type { DiscoveryResultRow } from './filmTypes.js';
import { simulateDelay } from './testDelay.js';
import { subtitleTextForRange } from './subtitleOverlap.js';

const MOCK_NOTES = [
  'Possible cultural sensitivity — verify local reception.',
  'Visual gag may not translate directly for this audience.',
  'Idiomatic phrase — consider a localized equivalent.',
];

const CUSTOM_VALUE_KEYS = new Set(['segmentDescription', 'gesture', 'notes']);

function mockValueFor(column: string, subtitleText: string, index: number): string {
  if (column === 'segmentDescription') return `Mock finding near "${subtitleText.slice(0, 40)}"`;
  if (column === 'gesture') return 'Mock gesture note';
  if (column === 'notes') return MOCK_NOTES[index % MOCK_NOTES.length];
  return `Mock ${column} value`;
}

/**
 * Canned discovery-pass output, delayed via simulateDelay so test mode is
 * genuinely demoable (a running pass stays visibly "running" for a realistic
 * stretch) rather than resolving instantly. See docs/adr/0021.
 */
export function createMockDiscoveryAgent(config: { mockDelayScale: number }): DiscoveryAgent {
  return {
    async runPass({ subtitleEntries, targetColumns }: DiscoveryPassInput): Promise<DiscoveryPassResult> {
      await simulateDelay({ minMs: 6000, maxMs: 9000 }, config.mockDelayScale);

      const dialogueEntries = subtitleEntries.slice(0, Math.min(2, subtitleEntries.length));
      const ranges: Array<{ startMs: number; endMs: number }> = dialogueEntries.map((e) => ({
        startMs: e.startMs,
        endMs: e.endMs,
      }));

      // One freeform, non-dialogue-anchored finding — demonstrates the whole
      // point of docs/adr/0023 (a visual gag/gesture with no subtitle line
      // under it) in mock mode too, not just a real Gemini pass. Placed in the
      // gap after the first entry when there's room for one; clamped to the
      // next entry's start otherwise so it can never accidentally overlap a
      // real line even when subtitles are packed close together (a fixed
      // "+1500ms" fallback did exactly that on a real film's dense subtitle
      // track — a synthetic "silent" row whose actual derived text wasn't
      // empty at all).
      if (subtitleEntries.length > 0) {
        const [first, second] = subtitleEntries;
        const idealEnd = first.endMs + 1500;
        const gapEnd = second ? Math.min(idealEnd, second.startMs) : idealEnd;
        if (gapEnd > first.endMs) ranges.push({ startMs: first.endMs, endMs: gapEnd });
      }

      const resultRows: DiscoveryResultRow[] = ranges.map((range, i) => {
        const subtitleText = subtitleTextForRange(subtitleEntries, range.startMs, range.endMs);
        const values: DiscoveryResultRow['values'] = {};
        for (const col of targetColumns) {
          const text = mockValueFor(col, subtitleText || '(a silent visual moment)', i);
          if (CUSTOM_VALUE_KEYS.has(col)) {
            (values as Record<string, string>)[col] = text;
          } else {
            values.custom = { ...(values.custom ?? {}), [col]: text };
          }
        }
        return {
          tempId: randomUUID(),
          startMs: range.startMs,
          endMs: range.endMs,
          subtitleText,
          values,
        };
      });

      return {
        resultRows,
        updatedConversation: [
          { role: 'user', parts: [{ text: '(mock pass — no real Gemini conversation)' }] },
          { role: 'model', parts: [{ text: JSON.stringify(resultRows) }] },
        ],
      };
    },
  };
}
