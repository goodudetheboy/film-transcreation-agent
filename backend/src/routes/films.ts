import { Router } from 'express';
import type { FilmStore } from '../services/filmStore.js';
import type { ProjectStore } from '../services/projectStore.js';
import type { Rubric } from '../services/researchAgent.js';

export interface FilmsRouteDeps {
  filmStore: FilmStore;
  projectStore: ProjectStore;
  defaultRubrics: Rubric[];
}

export function filmsRoute(deps: FilmsRouteDeps): Router {
  const router = Router();

  router.post('/api/films', (req, res) => {
    const { title, script, videoUrl } = req.body ?? {};

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (typeof script !== 'string' || script.trim() === '') {
      res.status(400).json({ error: 'script is required' });
      return;
    }
    if (typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    const film = deps.filmStore.createFilm({ title, script, videoUrl });
    res.status(201).json(film);
  });

  router.get('/api/films', (_req, res) => {
    res.status(200).json(deps.filmStore.listFilms());
  });

  router.get('/api/films/:id', (req, res) => {
    const film = deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    res.status(200).json(film);
  });

  router.post('/api/films/:id/create-project', (req, res) => {
    const film = deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }

    const { country, rubrics } = req.body ?? {};
    if (typeof country !== 'string' || country.trim() === '') {
      res.status(400).json({ error: 'country is required' });
      return;
    }

    const project = deps.projectStore.createProject({
      country,
      items: film.details.map((d) => ({ scriptLine: d.scriptLine, sceneDescription: d.sceneDescription })),
      rubrics: Array.isArray(rubrics) && rubrics.length > 0 ? rubrics : deps.defaultRubrics,
    });
    res.status(201).json(project);
  });

  return router;
}
