import { describe, it, expect } from 'vitest';
import { stripJsonFences } from './dialogflowClient.js';

describe('stripJsonFences', () => {
  it('returns plain JSON text unchanged', () => {
    expect(stripJsonFences('[]')).toBe('[]');
  });

  it('strips ```json fences', () => {
    expect(stripJsonFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it('strips plain ``` fences without a language tag', () => {
    expect(stripJsonFences('```\n[]\n```')).toBe('[]');
  });
});
