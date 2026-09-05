import { create } from 'zustand';
import type { ColumnDoc, DetailRow, DiscoveryAgentSession, DiscoveryChatStreamEvent, Film } from '../api/apiClient.types';

export interface FilmWorkspaceState {
  film: Film | null;
  rows: DetailRow[];
  columns: ColumnDoc[];
  discoveryChatSessions: DiscoveryAgentSession[];
  activeDiscoveryChatSessionId: string | null;

  setFilm: (film: Film) => void;
  setDetails: (rows: DetailRow[], columns: ColumnDoc[]) => void;
  addRow: (row: DetailRow) => void;
  updateRow: (row: DetailRow) => void;
  removeRow: (rowId: string) => void;
  addColumn: (column: ColumnDoc) => void;

  setDiscoveryChatSessions: (sessions: DiscoveryAgentSession[]) => void;
  upsertDiscoveryChatSession: (session: DiscoveryAgentSession) => void;
  removeDiscoveryChatSession: (agentId: string) => void;
  setActiveDiscoveryChatSessionId: (id: string | null) => void;
  applyDiscoveryChatEvent: (event: DiscoveryChatStreamEvent) => void;

  reset: () => void;
}

const initialState = {
  film: null as Film | null,
  rows: [] as DetailRow[],
  columns: [] as ColumnDoc[],
  discoveryChatSessions: [] as DiscoveryAgentSession[],
  activeDiscoveryChatSessionId: null as string | null,
};

/** One store per major page — filmPrepStore.ts is the sibling for the prep
 * screen. Follows projectWorkspaceStore.ts's shape for its own chat slice:
 * the Discovery Agent's chat sessions live here (not self-contained in
 * DiscoveryChatPanel) so a tool-triggered edit/merge/discard can update the
 * SAME `rows` the Details table renders, live, the same way a research chat
 * tool call patches projectWorkspaceStore's `items`. */
export const useFilmWorkspaceStore = create<FilmWorkspaceState>((set, get) => ({
  ...initialState,

  setFilm: (film) => set({ film }),
  setDetails: (rows, columns) => set({ rows, columns }),
  addRow: (row) => set({ rows: [...get().rows, row] }),
  updateRow: (row) => set({ rows: get().rows.map((r) => (r.id === row.id ? row : r)) }),
  removeRow: (rowId) => set({ rows: get().rows.filter((r) => r.id !== rowId) }),
  addColumn: (column) => set({ columns: [...get().columns, column] }),

  setDiscoveryChatSessions: (sessions) => set({ discoveryChatSessions: sessions }),

  upsertDiscoveryChatSession: (session) => {
    const sessions = get().discoveryChatSessions;
    const idx = sessions.findIndex((s) => s.id === session.id);
    set({
      discoveryChatSessions: idx === -1 ? [...sessions, session] : sessions.map((s, i) => (i === idx ? session : s)),
      activeDiscoveryChatSessionId: session.id,
    });
  },

  removeDiscoveryChatSession: (agentId) =>
    set({
      discoveryChatSessions: get().discoveryChatSessions.filter((s) => s.id !== agentId),
      activeDiscoveryChatSessionId: get().activeDiscoveryChatSessionId === agentId ? null : get().activeDiscoveryChatSessionId,
    }),

  setActiveDiscoveryChatSessionId: (id) => set({ activeDiscoveryChatSessionId: id }),

  applyDiscoveryChatEvent: (event) => {
    if (event.type === 'row_patched') get().updateRow(event.row);
    else if (event.type === 'row_added') get().addRow(event.row);
    // row_discarded never touches the Details table — nothing to apply here.
  },

  reset: () => set({ ...initialState }),
}));
