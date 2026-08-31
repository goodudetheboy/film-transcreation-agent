import { describe, it, expect } from 'vitest';
import { createInMemoryProjectItemStore } from './projectItemStore.js';

const baseInput = {
  filmId: 'film-a',
  detailRowId: 'row-1',
  startMs: 1000,
  endMs: 2000,
  subtitleText: 'Hello',
  sceneDescription: 'A scene',
  customValues: {},
};

describe('createInMemoryProjectItemStore', () => {
  it('createItems imports new items with pending action and null scores', async () => {
    const store = createInMemoryProjectItemStore();
    const created = await store.createItems('proj-a', [baseInput]);
    expect(created).toHaveLength(1);
    expect(created[0].action).toBe('pending');
    expect(created[0].importanceScore).toBeNull();
    expect(created[0].scores).toEqual([]);
  });

  it('createItems dedupes by detailRowId — calling twice does not duplicate', async () => {
    const store = createInMemoryProjectItemStore();
    await store.createItems('proj-a', [baseInput]);
    const secondCall = await store.createItems('proj-a', [baseInput, { ...baseInput, detailRowId: 'row-2' }]);
    expect(secondCall).toHaveLength(1);
    expect(secondCall[0].detailRowId).toBe('row-2');
    expect(await store.listItems('proj-a')).toHaveLength(2);
  });

  it('updateItem patches action, scoped per project', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    const updated = await store.updateItem('proj-a', item.id, { action: 'accepted' });
    expect(updated?.action).toBe('accepted');
    expect(await store.updateItem('proj-b', item.id, { action: 'rejected' })).toBeUndefined();
  });

  it('patchScore upserts a single rubric score and can carry a recomputed importanceScore', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);

    const patched = await store.patchScore('proj-a', item.id, 'rubric-1', {
      score: 8,
      reasoning: 'strong match',
      evidence: 'evidence text',
      sources: ['https://example.com'],
      updatedBy: 'chat-agent',
      importanceScore: 8,
    });
    expect(patched?.scores).toEqual([
      expect.objectContaining({ rubricId: 'rubric-1', score: 8, reasoning: 'strong match', updatedBy: 'chat-agent' }),
    ]);
    expect(patched?.importanceScore).toBe(8);

    // Patching the same rubric again merges rather than duplicating.
    const patchedAgain = await store.patchScore('proj-a', item.id, 'rubric-1', {
      reasoning: 'revised reasoning',
      updatedBy: 'user',
    });
    expect(patchedAgain?.scores).toHaveLength(1);
    expect(patchedAgain?.scores[0]).toMatchObject({ score: 8, reasoning: 'revised reasoning', updatedBy: 'user' });
  });

  it('applyResearchResult replaces the full score set and stamps lastResearchedAt', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    expect(item.lastResearchedAt).toBeNull();

    const updated = await store.applyResearchResult('proj-a', item.id, {
      scores: [
        { rubricId: 'r1', score: 9, reasoning: 'a', evidence: 'b', sources: [], updatedAt: new Date().toISOString(), updatedBy: 'batch-agent' },
      ],
      summary: 'Should transcreate.',
      shouldTranscreate: true,
      suggestedReplacement: { text: 'new line', justification: 'why' },
      importanceScore: 9,
    });
    expect(updated?.summary).toBe('Should transcreate.');
    expect(updated?.shouldTranscreate).toBe(true);
    expect(updated?.suggestedReplacement).toEqual({ text: 'new line', justification: 'why' });
    expect(updated?.importanceScore).toBe(9);
    expect(updated?.lastResearchedAt).not.toBeNull();
  });

  it('deleteItem removes only the targeted item for the right project', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    expect(await store.deleteItem('proj-b', item.id)).toBe(false);
    expect(await store.deleteItem('proj-a', item.id)).toBe(true);
    expect(await store.listItems('proj-a')).toHaveLength(0);
  });
});
