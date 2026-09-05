import { Router, type Response } from 'express';
import type { FilmStore } from '../services/filmStore.js';
import type { DiscoveryJobStore } from '../services/discoveryJobStore.js';
import type { DiscoveryChatSessionStore } from '../services/discoveryChatSessionStore.js';
import type { DiscoveryChatAgent, DiscoveryChatStreamEvent } from '../services/discoveryChatAgent.js';

function writeSSE(res: Response, event: DiscoveryChatStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface DiscoveryChatRouteDeps {
  filmStore: FilmStore;
  discoveryJobStore: DiscoveryJobStore;
  discoveryChatSessionStore: DiscoveryChatSessionStore;
  discoveryChatAgent: DiscoveryChatAgent;
  mockDiscoveryChatAgent: DiscoveryChatAgent;
}

export function discoveryChatRoute(deps: DiscoveryChatRouteDeps): Router {
  const router = Router();

  router.post('/api/films/:id/discovery-agents', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const { name } = req.body ?? {};
    const session = await deps.discoveryChatSessionStore.createSession({
      filmId: film.id,
      name: typeof name === 'string' && name.trim() !== '' ? name : undefined,
    });
    res.status(201).json(session);
  });

  router.get('/api/films/:id/discovery-agents', async (req, res) => {
    res.status(200).json(await deps.discoveryChatSessionStore.listSessions(req.params.id));
  });

  router.get('/api/films/:id/discovery-agents/:agentId', async (req, res) => {
    const session = await deps.discoveryChatSessionStore.getSession(req.params.id, req.params.agentId);
    if (!session) {
      res.status(404).json({ error: 'discovery agent not found' });
      return;
    }
    res.status(200).json(session);
  });

  router.delete('/api/films/:id/discovery-agents/:agentId', async (req, res) => {
    const deleted = await deps.discoveryChatSessionStore.deleteSession(req.params.id, req.params.agentId);
    if (!deleted) {
      res.status(404).json({ error: 'discovery agent not found' });
      return;
    }
    res.status(204).end();
  });

  // Records that a pass was kicked off from this agent's thread — the pass
  // itself is created via the existing POST /api/films/:id/discovery-jobs
  // (unchanged); this just files a `run` reference turn into the
  // conversation so it renders inline, same timeline as chat messages.
  router.post('/api/films/:id/discovery-agents/:agentId/runs', async (req, res) => {
    const session = await deps.discoveryChatSessionStore.getSession(req.params.id, req.params.agentId);
    if (!session) {
      res.status(404).json({ error: 'discovery agent not found' });
      return;
    }
    const { jobId } = req.body ?? {};
    if (typeof jobId !== 'string' || jobId.trim() === '') {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }
    const job = await deps.discoveryJobStore.getJob(req.params.id, jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }
    if (job.agentNumber !== session.agentNumber) {
      res.status(400).json({ error: `job belongs to Agent #${job.agentNumber}, not this Agent #${session.agentNumber}` });
      return;
    }

    const updated = await deps.discoveryChatSessionStore.updateSession(req.params.id, session.id, {
      turns: [...session.turns, { role: 'system', parts: [{ run: { jobId } }], ts: new Date().toISOString() }],
    });
    res.status(200).json(updated);
  });

  // The live tool-calling turn — SSE. Persistence of turns happens inside the
  // agent itself (after every round, see discoveryChatAgent.ts's runTurn), not
  // here; this route only owns the session's idle/streaming/error status and
  // relaying events to the wire — same shape as routes/projectChat.ts.
  router.post('/api/films/:id/discovery-agents/:agentId/messages', async (req, res) => {
    const session = await deps.discoveryChatSessionStore.getSession(req.params.id, req.params.agentId);
    if (!session) {
      res.status(404).json({ error: 'discovery agent not found' });
      return;
    }
    const { text, testMode } = req.body ?? {};
    if (typeof text !== 'string' || text.trim() === '') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const useMock = testMode !== false;
    const agent = useMock ? deps.mockDiscoveryChatAgent : deps.discoveryChatAgent;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    try {
      await deps.discoveryChatSessionStore.updateSession(req.params.id, session.id, { status: 'streaming' });
      let sawError = false;
      for await (const event of agent.runTurn({ session, userText: text })) {
        writeSSE(res, event);
        if (event.type === 'error') {
          sawError = true;
          await deps.discoveryChatSessionStore.updateSession(req.params.id, session.id, { status: 'error', errorMessage: event.message });
        }
      }
      if (!sawError) {
        await deps.discoveryChatSessionStore.updateSession(req.params.id, session.id, { status: 'idle' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      writeSSE(res, { type: 'error', message });
      await deps.discoveryChatSessionStore.updateSession(req.params.id, session.id, { status: 'error', errorMessage: message });
    } finally {
      res.end();
    }
  });

  return router;
}
