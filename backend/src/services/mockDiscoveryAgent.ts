import { randomUUID } from 'node:crypto';
import type { DiscoveryAgent, DiscoveryPassInput, DiscoveryPassResult } from './discoveryAgent.js';
import type { DiscoveryResultRow } from './filmTypes.js';
import { simulateDelay } from './testDelay.js';
import { formatMsAsTimestamp } from './timeFormat.js';

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

      const picked = subtitleEntries.slice(0, Math.min(3, subtitleEntries.length));
      const resultRows: DiscoveryResultRow[] = picked.map((entry, i) => {
        const values: DiscoveryResultRow['values'] = {};
        for (const col of targetColumns) {
          const text = mockValueFor(col, entry.text, i);
          if (CUSTOM_VALUE_KEYS.has(col)) {
            (values as Record<string, string>)[col] = text;
          } else {
            values.custom = { ...(values.custom ?? {}), [col]: text };
          }
        }
        return {
          tempId: randomUUID(),
          subtitleEntryId: entry.id,
          timestamp: formatMsAsTimestamp(entry.startMs),
          subtitleText: entry.text,
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
