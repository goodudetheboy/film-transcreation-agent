import { describe, it, expect } from 'vitest';
import { detailRowsToProjectItems } from './detailRowsToProjectItems.js';
import type { DetailRow } from './filmTypes.js';

function row(overrides: Partial<DetailRow> = {}): DetailRow {
  return {
    id: 'r1',
    filmId: 'f1',
    startMs: 1000,
    endMs: 2000,
    subtitleText: 'Hello there',
    values: { segmentDescription: '', gesture: '', notes: '', custom: {} },
    provenance: { type: 'user-marked' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('detailRowsToProjectItems', () => {
  it('maps subtitle text to scriptLine and prefers segmentDescription, falling back to gesture then notes', () => {
    const rows = [
      row({ subtitleText: 'Line A', values: { segmentDescription: 'desc', gesture: '', notes: '', custom: {} } }),
      row({ subtitleText: 'Line B', values: { segmentDescription: '', gesture: 'wave', notes: '', custom: {} } }),
      row({ subtitleText: 'Line C', values: { segmentDescription: '', gesture: '', notes: 'a note', custom: {} } }),
    ];
    expect(detailRowsToProjectItems(rows)).toEqual([
      { scriptLine: 'Line A', sceneDescription: 'desc' },
      { scriptLine: 'Line B', sceneDescription: 'wave' },
      { scriptLine: 'Line C', sceneDescription: 'a note' },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(detailRowsToProjectItems([])).toEqual([]);
  });
});
