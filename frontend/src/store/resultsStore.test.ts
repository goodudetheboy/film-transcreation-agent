import { describe, it, expect, beforeEach } from 'vitest';
import { useResultsStore } from './resultsStore';

describe('resultsStore', () => {
  beforeEach(() => {
    useResultsStore.getState().reset();
  });

  it('starts with an empty lines array and idle status', () => {
    const state = useResultsStore.getState();
    expect(state.lines).toEqual([]);
    expect(state.status).toBe('idle');
  });

  it('addFlaggedLine appends to lines', () => {
    useResultsStore.getState().addFlaggedLine({ line: 'a', reason: 'b', suggestedReplacement: 'c' });
    expect(useResultsStore.getState().lines).toHaveLength(1);
  });

  it('reset() clears back to initial state', () => {
    useResultsStore.getState().addFlaggedLine({ line: 'a', reason: 'b', suggestedReplacement: 'c' });
    useResultsStore.getState().setStatus('done');
    useResultsStore.getState().reset();
    expect(useResultsStore.getState().lines).toEqual([]);
    expect(useResultsStore.getState().status).toBe('idle');
  });
});
