import type { DiscoveryAgent } from './discoveryAgent.js';
import type { DetailRowsStore } from './detailRowsStore.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';
import type { FilmPrep, FilmPrepStage } from './filmTypes.js';
import type { FilmStore } from './filmStore.js';
import { simulateDelay } from './testDelay.js';

export interface FilmPrepPipelineDeps {
  filmStore: FilmStore;
  detailRowsStore: DetailRowsStore;
  discoveryAgent: DiscoveryAgent;
  mockDiscoveryAgent: DiscoveryAgent;
  eventBus: DiscoveryEventBus;
  mockDelayScale: number;
}

export interface FilmPrepPipeline {
  run(filmId: string, testMode: boolean): Promise<void>;
}

function filmChannel(filmId: string): string {
  return `filmPrep:${filmId}`;
}

/**
 * Orchestrates the async part of film creation (see the "Your film is being
 * prepared" wireframe screen): optionally auto-runs one Discovery pass and
 * merges its findings straight into the Details table (no user is present yet
 * to click Add), then finalizes. Runs fire-and-forget after POST /api/films
 * returns 201 — its progress is observed via GET /api/films/:id/prep-status
 * (SSE, replay-then-follow via `film.prep.log` + this event bus).
 */
export function createFilmPrepPipeline(deps: FilmPrepPipelineDeps): FilmPrepPipeline {
  async function appendLog(filmId: string, message: string): Promise<void> {
    const current = await deps.filmStore.getFilm(filmId);
    if (!current) return;
    const now = new Date().toISOString();
    const updated = await deps.filmStore.updateFilm(filmId, {
      prep: { ...current.prep, log: [...current.prep.log, { ts: now, message }] },
    });
    if (updated) deps.eventBus.publish(filmChannel(filmId), { type: 'prep_update', prep: updated.prep });
  }

  async function setStage(filmId: string, stage: FilmPrepStage, patch: Partial<FilmPrep> = {}): Promise<void> {
    const current = await deps.filmStore.getFilm(filmId);
    if (!current) return;
    const updated = await deps.filmStore.updateFilm(filmId, {
      prep: { ...current.prep, ...patch, stage },
    });
    if (updated) deps.eventBus.publish(filmChannel(filmId), { type: 'prep_update', prep: updated.prep });
  }

  return {
    async run(filmId, testMode) {
      const film = await deps.filmStore.getFilm(filmId);
      if (!film) return;

      try {
        if (film.runDiscoveryOnCreate) {
          if (!film.subtitle || film.subtitle.entries.length === 0) {
            await appendLog(filmId, 'Skipped Discovery agent — no parsed subtitle entries to anchor findings to.');
          } else {
            await appendLog(filmId, 'Searching the video for details…');
            const agent = testMode ? deps.mockDiscoveryAgent : deps.discoveryAgent;
            const result = await agent.runPass({
              videoUrl: film.videoUrl,
              subtitleEntries: film.subtitle.entries,
              specialInstruction: '',
              targetColumns: ['segmentDescription', 'gesture'],
              priorConversation: [],
            });
            for (const row of result.resultRows) {
              await deps.detailRowsStore.addRow(filmId, {
                startMs: row.startMs,
                endMs: row.endMs,
                subtitleText: row.subtitleText,
                values: {
                  segmentDescription: row.values.segmentDescription,
                  gesture: row.values.gesture,
                  notes: row.values.notes,
                  custom: row.values.custom,
                },
                provenance: { type: 'agent-discovered', jobId: 'prep-pipeline', agentNumber: 0, passNumber: 0 },
              });
            }
            await appendLog(filmId, `Found ${result.resultRows.length} candidate detail(s).`);
          }
          await setStage(filmId, 'finalizing', { discoveryDone: true });
        }

        if (testMode) {
          await simulateDelay({ minMs: 500, maxMs: 1000 }, deps.mockDelayScale);
        }
        await appendLog(filmId, 'Finalizing…');
        await setStage(filmId, 'ready', { finalizeDone: true });
        await deps.filmStore.updateFilm(filmId, { status: 'processed' });
        await appendLog(filmId, 'Your film is up and ready!');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await setStage(filmId, 'error', { errorMessage: message });
        await appendLog(filmId, `Error: ${message}`);
      }
    },
  };
}
