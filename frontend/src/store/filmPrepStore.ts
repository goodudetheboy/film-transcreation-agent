import { create } from 'zustand';
import type { FilmPrep, FilmPrepStreamEvent } from '../api/apiClient.types';

export interface FilmPrepState {
  prep: FilmPrep | null;
  applyEvent: (event: FilmPrepStreamEvent) => void;
  reset: () => void;
}

/** Page-scoped store for the "Your film is being prepared" screen — mirrors
 * projectStore.ts's reducer-over-SSE-events shape. Every event carries the
 * full current prep object (replay-then-follow, see docs/adr/0020), so
 * applying one is just "adopt the latest snapshot," no merging needed. */
export const useFilmPrepStore = create<FilmPrepState>((set) => ({
  prep: null,
  applyEvent: (event) => set({ prep: event.prep }),
  reset: () => set({ prep: null }),
}));
