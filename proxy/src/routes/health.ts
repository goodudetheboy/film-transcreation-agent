import { Router } from 'express';

export function healthRoute(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  return router;
}
