import { Router } from 'express';
import type { CreateRubricInput } from '../services/projectRubricStore.js';

export interface ConfigRouteDeps {
  defaultRubrics: CreateRubricInput[];
}

/** Read-only exposure of small server-side config the frontend needs to
 * offer as a starting point — e.g. "use default rubrics" in RubricsEditor —
 * without hardcoding a second copy of it client-side. */
export function configRoute(deps: ConfigRouteDeps): Router {
  const router = Router();
  router.get('/api/default-rubrics', (_req, res) => {
    res.status(200).json(deps.defaultRubrics);
  });
  return router;
}
