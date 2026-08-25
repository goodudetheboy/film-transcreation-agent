import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from './projectStore';
import type { Project } from '../api/apiClient.types';

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    country: 'Japan',
    items: [{ id: 'i1', scriptLine: 'a', sceneDescription: 'b' }],
    rubrics: [{ id: 'food-aversion', description: 'x' }],
    status: 'draft',
    batches: [],
    results: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
  });

  it('starts with no current project and idle status', () => {
    const state = useProjectStore.getState();
    expect(state.currentProject).toBeNull();
    expect(state.researchStatus).toBe('idle');
    expect(state.itemResults).toEqual({});
  });

  it('setCurrentProject seeds itemResults from the project\'s existing results', () => {
    const project = fakeProject({
      status: 'done',
      results: [{ itemId: 'i1', targetCountry: 'Japan', findings: [] }],
    });
    useProjectStore.getState().setCurrentProject(project);
    const state = useProjectStore.getState();
    expect(state.currentProject).toEqual(project);
    expect(state.itemResults['i1']).toEqual(project.results[0]);
    expect(state.researchStatus).toBe('done');
  });

  it('maps project.status to researchStatus for researching/error too', () => {
    useProjectStore.getState().setCurrentProject(fakeProject({ status: 'researching' }));
    expect(useProjectStore.getState().researchStatus).toBe('streaming');

    useProjectStore.getState().setCurrentProject(fakeProject({ status: 'error', errorMessage: 'boom' }));
    expect(useProjectStore.getState().researchStatus).toBe('error');
    expect(useProjectStore.getState().errorMessage).toBe('boom');
  });

  it('startResearch sets streaming status and clears prior batch progress/error', () => {
    useProjectStore.getState().setCurrentProject(fakeProject({ status: 'error', errorMessage: 'boom' }));
    useProjectStore.getState().startResearch();
    const state = useProjectStore.getState();
    expect(state.researchStatus).toBe('streaming');
    expect(state.batchProgress).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('applyEvent merges batch_done results into itemResults and sets batchProgress', () => {
    useProjectStore.getState().setCurrentProject(fakeProject());
    useProjectStore.getState().applyEvent({
      type: 'batch_done',
      batchIndex: 0,
      totalBatches: 2,
      itemIds: ['i1'],
      results: [{ itemId: 'i1', targetCountry: 'Japan', findings: [] }],
    });
    const state = useProjectStore.getState();
    expect(state.itemResults['i1']).toBeDefined();
    expect(state.batchProgress).toEqual({ batchIndex: 0, totalBatches: 2 });
  });

  it('applyEvent(done) sets researchStatus to done', () => {
    useProjectStore.getState().applyEvent({ type: 'done', summary: { totalItems: 1, totalFindings: 0 } });
    expect(useProjectStore.getState().researchStatus).toBe('done');
  });

  it('applyEvent(error) sets researchStatus to error and stores the message', () => {
    useProjectStore.getState().applyEvent({ type: 'error', message: 'boom' });
    expect(useProjectStore.getState().researchStatus).toBe('error');
    expect(useProjectStore.getState().errorMessage).toBe('boom');
  });

  it('reset() clears back to initial state', () => {
    useProjectStore.getState().setCurrentProject(fakeProject());
    useProjectStore.getState().reset();
    const state = useProjectStore.getState();
    expect(state.currentProject).toBeNull();
    expect(state.researchStatus).toBe('idle');
    expect(state.itemResults).toEqual({});
  });
});
