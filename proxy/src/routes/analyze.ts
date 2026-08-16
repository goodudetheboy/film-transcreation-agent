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
  maxScriptLines: number;
  revealDelayMs: number;
}

export function analyzeRoute(deps: AnalyzeRouteDeps): Router {
  const router = Router();

  router.post('/api/analyze', async (req, res) => {
    const { script, targetCountry } = req.body ?? {};

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
      writeEvent(res, { type: 'progress', message: 'analyzing script' });
      const flaggedLines = await deps.dialogflowClient.analyzeScript({
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
