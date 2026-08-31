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
    expect(created[0].trendSuggestions).toBeNull();
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

  it('patchScore never writes an explicit userNote:undefined key when neither the patch nor an existing score has one', async () => {
    // Regression test: found via live verification against real Firestore, not
    // this in-memory fake — Firestore's .set() throws "Cannot use 'undefined'
    // as a Firestore value" on an explicit undefined field, which the
    // in-memory Map-backed fake happily tolerates. Guards the upsertScore()
    // fix (omit the key entirely rather than assign it undefined).
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);

    const patched = await store.patchScore('proj-a', item.id, 'rubric-1', {
      score: 8,
      reasoning: 'no user note provided',
      updatedBy: 'chat-agent',
    });
    expect(Object.prototype.hasOwnProperty.call(patched!.scores[0], 'userNote')).toBe(false);

    // Once a userNote IS supplied, subsequent patches that don't touch it
    // must preserve it rather than dropping it back to undefined.
    const withNote = await store.patchScore('proj-a', item.id, 'rubric-1', { userNote: 'flagged for follow-up', updatedBy: 'user' });
    expect(withNote?.scores[0].userNote).toBe('flagged for follow-up');
    const afterUnrelatedPatch = await store.patchScore('proj-a', item.id, 'rubric-1', { score: 9, updatedBy: 'chat-agent' });
    expect(afterUnrelatedPatch?.scores[0].userNote).toBe('flagged for follow-up');
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

  it('setSuggestedReplacement sets the suggestion and flips shouldTranscreate to true', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    expect(item.shouldTranscreate).toBeNull();

    const updated = await store.setSuggestedReplacement('proj-a', item.id, { text: 'new line', justification: 'because' });
    expect(updated?.suggestedReplacement).toEqual({ text: 'new line', justification: 'because' });
    expect(updated?.shouldTranscreate).toBe(true);
    expect(await store.setSuggestedReplacement('proj-b', item.id, { text: 'x', justification: 'y' })).toBeUndefined();
  });

  it('setTrendSuggestions sets trendSuggestions without touching suggestedReplacement or shouldTranscreate', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    expect(item.trendSuggestions).toBeNull();

    const trendSuggestion = {
      text: 'use the current trend',
      justification: 'because',
      sourceUrl: 'https://example.com/trend',
      sourceTitle: 'Trend',
      publishedDate: '2026-05-01',
    };
    const updated = await store.setTrendSuggestions('proj-a', item.id, [trendSuggestion]);
    expect(updated?.trendSuggestions).toEqual([trendSuggestion]);
    expect(updated?.suggestedReplacement).toBeNull();
    expect(updated?.shouldTranscreate).toBeNull();
    expect(await store.setTrendSuggestions('proj-b', item.id, [trendSuggestion])).toBeUndefined();
  });

  it('deleteItem removes only the targeted item for the right project', async () => {
    const store = createInMemoryProjectItemStore();
    const [item] = await store.createItems('proj-a', [baseInput]);
    expect(await store.deleteItem('proj-b', item.id)).toBe(false);
    expect(await store.deleteItem('proj-a', item.id)).toBe(true);
    expect(await store.listItems('proj-a')).toHaveLength(0);
  });
});
