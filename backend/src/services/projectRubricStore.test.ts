import { describe, it, expect } from 'vitest';
import { createInMemoryProjectRubricStore } from './projectRubricStore.js';

describe('createInMemoryProjectRubricStore', () => {
  it('createRubric/listRubrics round-trip, scoped per project, in creation order', async () => {
    const store = createInMemoryProjectRubricStore();
    await store.createRubric('proj-a', { name: 'Food aversion', description: 'desc', weight: 3 , trendEligible: false });
    await store.createRubric('proj-a', { name: 'Wordplay', description: 'desc2', weight: 4 , trendEligible: false });
    await store.createRubric('proj-b', { name: 'Other', description: 'desc3', weight: 2 , trendEligible: false });

    const rubricsA = await store.listRubrics('proj-a');
    expect(rubricsA.map((r) => r.name)).toEqual(['Food aversion', 'Wordplay']);
    expect(rubricsA[0].projectId).toBe('proj-a');
    expect(await store.listRubrics('proj-b')).toHaveLength(1);
  });

  it('updateRubric patches fields, scoped per project; undefined for wrong project', async () => {
    const store = createInMemoryProjectRubricStore();
    const rubric = await store.createRubric('proj-a', { name: 'Food', description: 'd', weight: 3 , trendEligible: false });
    const updated = await store.updateRubric('proj-a', rubric.id, { weight: 5 });
    expect(updated?.weight).toBe(5);
    expect(await store.updateRubric('proj-b', rubric.id, { weight: 1 })).toBeUndefined();
  });

  it('deleteRubric removes only the targeted rubric for the right project', async () => {
    const store = createInMemoryProjectRubricStore();
    const rubric = await store.createRubric('proj-a', { name: 'Food', description: 'd', weight: 3 , trendEligible: false });
    expect(await store.deleteRubric('proj-b', rubric.id)).toBe(false);
    expect(await store.deleteRubric('proj-a', rubric.id)).toBe(true);
    expect(await store.listRubrics('proj-a')).toHaveLength(0);
  });
});
