import { vi } from 'vitest';
import type { TrendAgent } from '../../../backend/src/services/trendAgent';
import type { TrendSuggestion } from '../../../backend/src/services/researchAgent';

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002/0012/0013
 * and CLAUDE.md. Returns the given suggestions regardless of the item/rubrics passed in. */
export function fakeTrendAgent(suggestions: TrendSuggestion[] = []): TrendAgent {
  return {
    findTrendSuggestions: vi.fn(async () => suggestions),
  };
}
