import { vi } from 'vitest';
import type { TrendAgent } from '../../../backend/src/services/trendAgent';
import type { TrendSuggestion } from '../../../backend/src/services/researchAgent';

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002/0012/0013
 * and CLAUDE.md. Returns the given suggestions for every item it's asked about. */
export function fakeTrendAgent(suggestions: TrendSuggestion[] = []): TrendAgent {
  return {
    findTrendSuggestions: vi.fn(async ({ items }) => {
      const output: Record<string, TrendSuggestion[]> = {};
      for (const { item } of items) {
        if (suggestions.length > 0) output[item.id] = suggestions;
      }
      return output;
    }),
  };
}
