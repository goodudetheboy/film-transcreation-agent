import { vi } from 'vitest';
import type { DiscoveryAgent, DiscoveryPassResult } from '../../../backend/src/services/discoveryAgent';

/** The ONLY thing allowed to be fake in this test layer — see CLAUDE.md. */
export function fakeDiscoveryAgent(result?: DiscoveryPassResult): DiscoveryAgent {
  return {
    runPass: vi.fn().mockImplementation(async ({ subtitleEntries, targetColumns }) => {
      if (result) return result;
      const entry = subtitleEntries[0];
      return {
        resultRows: entry
          ? [
              {
                tempId: 'fake-result-1',
                startMs: entry.startMs,
                endMs: entry.endMs,
                subtitleText: entry.text,
                values: Object.fromEntries(targetColumns.map((c: string) => [c, `fake ${c}`])),
              },
            ]
          : [],
        updatedConversation: [],
      } satisfies DiscoveryPassResult;
    }),
  };
}
