import { describe, it, expect } from 'vitest';
import { computeImportanceScore } from './importanceScore.js';
import type { Rubric, RubricScore } from './projectTypes.js';

const now = new Date().toISOString();

function rubric(id: string, weight: number): Rubric {
  return { id, projectId: 'proj-a', name: id, description: '', weight, createdAt: now, updatedAt: now };
}
function score(rubricId: string, value: number): RubricScore {
  return { rubricId, score: value, reasoning: '', evidence: '', sources: [], updatedAt: now, updatedBy: 'user' };
}

describe('computeImportanceScore', () => {
  it('returns null when there are no scores', () => {
    expect(computeImportanceScore([], [rubric('r1', 3)])).toBeNull();
  });

  it('returns null when none of the scores match a known rubric', () => {
    expect(computeImportanceScore([score('unknown', 9)], [rubric('r1', 3)])).toBeNull();
  });

  it('returns the raw score when there is exactly one matching rubric', () => {
    expect(computeImportanceScore([score('r1', 7)], [rubric('r1', 3)])).toBe(7);
  });

  it('weights higher-weight rubrics more heavily', () => {
    // r1 (weight 5) scores 10, r2 (weight 1) scores 0 -> weighted toward r1's 10.
    const result = computeImportanceScore(
      [score('r1', 10), score('r2', 0)],
      [rubric('r1', 5), rubric('r2', 1)],
    );
    // (10*5 + 0*1) / 6 = 8.333... -> rounded to 1 decimal
    expect(result).toBeCloseTo(8.3, 1);
  });

  it('ignores scores for rubrics not passed in (e.g. a deleted rubric)', () => {
    const result = computeImportanceScore([score('r1', 10), score('deleted-rubric', 0)], [rubric('r1', 3)]);
    expect(result).toBe(10);
  });
});
