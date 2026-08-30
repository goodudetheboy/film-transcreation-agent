import { describe, it, expect } from 'vitest';
import { createInMemoryDetailRowsStore } from './detailRowsStore.js';

describe('createInMemoryDetailRowsStore rows', () => {
  it('addRow fills in default empty values and returns them via listRows, scoped per film', async () => {
    const store = createInMemoryDetailRowsStore();
    await store.addRow('film-a', {
      startMs: 1000,
      endMs: 2000,
      subtitleText: 'Hello',
      values: { segmentDescription: 'desc' },
      provenance: { type: 'user-marked' },
    });
    await store.addRow('film-b', {
      startMs: 2000,
      endMs: 3000,
      subtitleText: 'Other film',
      values: {},
      provenance: { type: 'user-marked' },
    });

    const rowsA = await store.listRows('film-a');
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].values).toEqual({ segmentDescription: 'desc', gesture: '', notes: '', custom: {} });
    expect(await store.listRows('film-b')).toHaveLength(1);
  });

  it('updateRow merges values and can retime startMs/endMs; returns undefined for the wrong film', async () => {
    const store = createInMemoryDetailRowsStore();
    const row = await store.addRow('film-a', {
      startMs: 1000,
      endMs: 2000,
      subtitleText: 'Hello',
      values: { segmentDescription: 'desc' },
      provenance: { type: 'user-marked' },
    });

    const updated = await store.updateRow('film-a', row.id, { values: { gesture: 'wave' } });
    expect(updated?.values).toEqual({ segmentDescription: 'desc', gesture: 'wave', notes: '', custom: {} });

    const retimed = await store.updateRow('film-a', row.id, { startMs: 5000, endMs: 6500, subtitleText: '' });
    expect(retimed).toMatchObject({ startMs: 5000, endMs: 6500, subtitleText: '' });

    expect(await store.updateRow('film-b', row.id, { values: { notes: 'x' } })).toBeUndefined();
  });

  it('deleteRow removes only the targeted row for the right film', async () => {
    const store = createInMemoryDetailRowsStore();
    const row = await store.addRow('film-a', {
      startMs: 1000,
      endMs: 2000,
      subtitleText: 'Hello',
      values: {},
      provenance: { type: 'user-marked' },
    });
    expect(await store.deleteRow('film-b', row.id)).toBe(false);
    expect(await store.deleteRow('film-a', row.id)).toBe(true);
    expect(await store.listRows('film-a')).toHaveLength(0);
  });
});

describe('createInMemoryDetailRowsStore columns', () => {
  it('addColumn derives a stable snake_case key from the name, scoped per film', async () => {
    const store = createInMemoryDetailRowsStore();
    const column = await store.addColumn('film-a', 'Local Slang?', 'Note any regional slang the localizer should adapt.');
    expect(column.name).toBe('Local Slang?');
    expect(column.description).toBe('Note any regional slang the localizer should adapt.');
    expect(column.key).toBe('local_slang');
    expect(await store.listColumns('film-a')).toHaveLength(1);
    expect(await store.listColumns('film-b')).toHaveLength(0);
  });
});
