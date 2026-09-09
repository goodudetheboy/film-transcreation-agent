import { describe, it, expect } from 'vitest';
import { humanizeToolName } from './humanizeToolName';

describe('humanizeToolName', () => {
  it('title-cases a multi-word snake_case name', () => {
    expect(humanizeToolName('update_rubric_score')).toBe('Update Rubric Score');
  });

  it('capitalizes a single-word name', () => {
    expect(humanizeToolName('search_web')).toBe('Search Web');
  });
});
