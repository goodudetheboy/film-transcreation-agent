import { Router } from 'express';
import type { CaptioningClient } from '../services/captioningClient.js';

export interface PreprocessVideoRouteDeps {
  captioningClient: CaptioningClient;
  mockCaptioningClient: CaptioningClient;
}

export function preprocessVideoRoute(deps: PreprocessVideoRouteDeps): Router {
  const router = Router();

  router.post('/api/preprocess-video', async (req, res) => {
    const { videoUrl, testMode } = req.body ?? {};
    // Same convention as /api/analyze: defaults to mock unless explicitly false.
    const useMock = testMode !== false;
    const client = useMock ? deps.mockCaptioningClient : deps.captioningClient;

    if (typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    try {
      const lines = await client.preprocessVideo({ videoUrl });
      res.status(200).json({ lines });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
