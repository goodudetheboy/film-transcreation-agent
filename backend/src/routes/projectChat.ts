import { Router, type Response } from 'express';
import type { ProjectStore } from '../services/projectStore.js';
import type { ChatSessionStore } from '../services/chatSessionStore.js';
import type { ResearchRunStore } from '../services/researchRunStore.js';
import type { ChatStreamEvent, ResearchChatAgent } from '../services/researchChatAgent.js';

function writeSSE(res: Response, event: ChatStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface ProjectChatRouteDeps {
  projectStore: ProjectStore;
  chatSessionStore: ChatSessionStore;
  researchRunStore: ResearchRunStore;
  researchChatAgent: ResearchChatAgent;
  mockResearchChatAgent: ResearchChatAgent;
}

export function projectChatRoute(deps: ProjectChatRouteDeps): Router {
  const router = Router();

  router.post('/api/projects/:id/chat-sessions', async (req, res) => {
    const project = await deps.projectStore.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    const { name } = req.body ?? {};
    const session = await deps.chatSessionStore.createSession({
      projectId: project.id,
      name: typeof name === 'string' && name.trim() !== '' ? name : undefined,
    });
    res.status(201).json(session);
  });

  router.get('/api/projects/:id/chat-sessions', async (req, res) => {
    res.status(200).json(await deps.chatSessionStore.listSessions(req.params.id));
  });

  router.get('/api/projects/:id/chat-sessions/:sessionId', async (req, res) => {
    const session = await deps.chatSessionStore.getSession(req.params.id, req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'chat session not found' });
      return;
    }
    res.status(200).json(session);
  });

  // Records that a bulk research run was kicked off from this chat session's
  // thread — the run itself is created via the existing POST
  // .../research-runs (unchanged, see routes/projects.ts); this just files a
  // `run` reference turn so it renders inline in the conversation, same
  // pattern as routes/discoveryChat.ts's .../runs endpoint.
  router.post('/api/projects/:id/chat-sessions/:sessionId/research-runs', async (req, res) => {
    const session = await deps.chatSessionStore.getSession(req.params.id, req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'chat session not found' });
      return;
    }
    const { runId } = req.body ?? {};
    if (typeof runId !== 'string' || runId.trim() === '') {
      res.status(400).json({ error: 'runId is required' });
      return;
    }
    const run = await deps.researchRunStore.getRun(req.params.id, runId);
    if (!run) {
      res.status(404).json({ error: 'research run not found' });
      return;
    }

    const updated = await deps.chatSessionStore.updateSession(req.params.id, session.id, {
      turns: [...session.turns, { role: 'system', parts: [{ run: { runId } }], ts: new Date().toISOString() }],
    });
    res.status(200).json(updated);
  });

  // The live tool-calling turn — SSE. Persistence of turns happens inside the
  // agent itself (after every round, see researchChatAgent.ts's runTurn), not
  // here; this route only owns the session's idle/streaming/error status and
  // relaying events to the wire.
  router.post('/api/projects/:id/chat-sessions/:sessionId/messages', async (req, res) => {
    const session = await deps.chatSessionStore.getSession(req.params.id, req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'chat session not found' });
      return;
    }
    const { text, testMode, itemId } = req.body ?? {};
    if (typeof text !== 'string' || text.trim() === '') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const useMock = testMode !== false;
    const agent = useMock ? deps.mockResearchChatAgent : deps.researchChatAgent;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    try {
      await deps.chatSessionStore.updateSession(req.params.id, session.id, { status: 'streaming' });
      let sawError = false;
      for await (const event of agent.runTurn({ session, userText: text, itemId: typeof itemId === 'string' ? itemId : undefined })) {
        writeSSE(res, event);
        if (event.type === 'error') {
          sawError = true;
          await deps.chatSessionStore.updateSession(req.params.id, session.id, { status: 'error', errorMessage: event.message });
        }
      }
      if (!sawError) {
        await deps.chatSessionStore.updateSession(req.params.id, session.id, { status: 'idle' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      writeSSE(res, { type: 'error', message });
      await deps.chatSessionStore.updateSession(req.params.id, session.id, { status: 'error', errorMessage: message });
    } finally {
      res.end();
    }
  });

  return router;
}
