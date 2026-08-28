import { create } from 'zustand';
import type {
  ColumnDoc,
  DetailRow,
  DiscoveryJob,
  DiscoveryJobStreamEvent,
  DiscoveryJobSummary,
  Film,
} from '../api/apiClient.types';

export interface FilmWorkspaceState {
  film: Film | null;
  rows: DetailRow[];
  columns: ColumnDoc[];
  jobs: DiscoveryJobSummary[];
  jobDetails: Record<string, DiscoveryJob>;
  activeJobId: string | null;

  setFilm: (film: Film) => void;
  setDetails: (rows: DetailRow[], columns: ColumnDoc[]) => void;
  setJobs: (jobs: DiscoveryJobSummary[]) => void;
  upsertJobSummary: (job: DiscoveryJobSummary) => void;
  setActiveJobId: (id: string | null) => void;
  applyJobEvent: (event: DiscoveryJobStreamEvent) => void;
  addRow: (row: DetailRow) => void;
  updateRow: (row: DetailRow) => void;
  removeRow: (rowId: string) => void;
  addColumn: (column: ColumnDoc) => void;
  reset: () => void;
}

const initialState = {
  film: null as Film | null,
  rows: [] as DetailRow[],
  columns: [] as ColumnDoc[],
  jobs: [] as DiscoveryJobSummary[],
  jobDetails: {} as Record<string, DiscoveryJob>,
  activeJobId: null as string | null,
};

function summaryFromJob(job: DiscoveryJob): DiscoveryJobSummary {
  const { log: _log, resultRows: _resultRows, commentHistory: _commentHistory, ...summary } = job;
  return summary;
}

/** One store per major page — filmPrepStore.ts is the sibling for the prep
 * screen. Follows projectStore.ts's reducer-over-events shape: applyJobEvent
 * always adopts the latest full job snapshot (replay-then-follow, see
 * docs/adr/0020), and keeps the lightweight running-list summary in sync so
 * AgentRunningList reflects live status without a separate poll. */
export const useFilmWorkspaceStore = create<FilmWorkspaceState>((set, get) => ({
  ...initialState,

  setFilm: (film) => set({ film }),
  setDetails: (rows, columns) => set({ rows, columns }),
  setJobs: (jobs) => set({ jobs }),

  upsertJobSummary: (job) => {
    const jobs = get().jobs;
    const idx = jobs.findIndex((j) => j.id === job.id);
    set({ jobs: idx === -1 ? [...jobs, job] : jobs.map((j, i) => (i === idx ? job : j)) });
  },

  setActiveJobId: (id) => set({ activeJobId: id }),

  applyJobEvent: (event) => {
    const job = event.job;
    const jobDetails = { ...get().jobDetails, [job.id]: job };
    const summary = summaryFromJob(job);
    const jobs = get().jobs;
    const idx = jobs.findIndex((j) => j.id === job.id);
    set({
      jobDetails,
      jobs: idx === -1 ? [...jobs, summary] : jobs.map((j, i) => (i === idx ? summary : j)),
    });
  },

  addRow: (row) => set({ rows: [...get().rows, row] }),
  updateRow: (row) => set({ rows: get().rows.map((r) => (r.id === row.id ? row : r)) }),
  removeRow: (rowId) => set({ rows: get().rows.filter((r) => r.id !== rowId) }),
  addColumn: (column) => set({ columns: [...get().columns, column] }),

  reset: () => set({ ...initialState }),
}));
