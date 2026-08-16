import { create } from 'zustand';
import type { FlaggedLine } from '../api/apiClient.types';

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface ResultsState {
  status: StreamStatus;
  lines: FlaggedLine[];
  errorMessage: string | null;
  addFlaggedLine: (line: FlaggedLine) => void;
  setStatus: (status: StreamStatus) => void;
  setError: (message: string) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as StreamStatus,
  lines: [] as FlaggedLine[],
  errorMessage: null as string | null,
};

export const useResultsStore = create<ResultsState>((set) => ({
  ...initialState,
  addFlaggedLine: (line) => set((s) => ({ lines: [...s.lines, line] })),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  reset: () => set({ ...initialState }),
}));
