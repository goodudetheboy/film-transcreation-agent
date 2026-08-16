import { Router, type Response } from 'express';
import type { DialogflowClient, FlaggedLine } from '../services/dialogflowClient.js';

export type AgentEvent =
  | { type: 'progress'; message: string }
  | { type: 'line_flagged'; line: FlaggedLine }
  | { type: 'done'; summary: { totalFlagged: number } }
  | { type: 'error'; message: string };

function writeEvent(res: Response, event: AgentEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AnalyzeRouteDeps {
  dialogflowClient: DialogflowClient;
  mockDialogflowClient: DialogflowClient;
  maxScriptLines: number;
  revealDelayMs: number;
}

export function analyzeRoute(deps: AnalyzeRouteDeps): Router {
  const router = Router();

  router.post('/api/analyze', async (req, res) => {
    const { script, targetCountry, testMode } = req.body ?? {};
    // Defaults true unless explicitly false — safer for a hackathon demo than
    // silently hitting the real paid API if a caller forgets the flag. See
    // docs/adr/0010-test-mode-mock-data.md.
    const useMock = testMode !== false;
    const client = useMock ? deps.mockDialogflowClient : deps.dialogflowClient;

    if (typeof script !== 'string' || script.trim() === '') {
      res.status(400).json({ error: 'script is required' });
      return;
    }
    if (typeof targetCountry !== 'string' || targetCountry.trim() === '') {
      res.status(400).json({ error: 'targetCountry is required' });
      return;
    }
    const lineCount = script.split('\n').length;
    if (lineCount > deps.maxScriptLines) {
      res.status(400).json({ error: `script exceeds ${deps.maxScriptLines} lines` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      writeEvent(res, {
        type: 'progress',
        message: useMock ? 'analyzing script (test mode — mock data)' : 'analyzing script',
      });
      const flaggedLines = await client.analyzeScript({
        script,
        country: targetCountry,
      });
      for (const line of flaggedLines) {
        if (deps.revealDelayMs > 0) {
          await sleep(deps.revealDelayMs);
        }
        writeEvent(res, { type: 'line_flagged', line });
      }
      writeEvent(res, { type: 'done', summary: { totalFlagged: flaggedLines.length } });
    } catch (err) {
      writeEvent(res, {
        type: 'error',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      res.end();
    }
  });

  return router;
}
