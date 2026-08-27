import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import type { FilmStore } from '../services/filmStore.js';
import type { ProjectStore } from '../services/projectStore.js';
import type { Rubric } from '../services/researchAgent.js';
import { guessExtension, type VideoBucketUploader } from '../services/videoBucketUploader.js';
import { preprocessingToItems } from '../services/preprocessingToItems.js';

export interface FilmsRouteDeps {
  filmStore: FilmStore;
  projectStore: ProjectStore;
  defaultRubrics: Rubric[];
  videoBucketUploader: VideoBucketUploader;
  maxVideoUploadBytes: number;
}

function isMockRequest(testMode: unknown): boolean {
  // Same convention as /api/preprocess-video: defaults to mock/no live calls unless explicitly false.
  // Multipart form fields arrive as strings, so "false" (not just false) must opt out of mock mode.
  return testMode !== false && testMode !== 'false';
}

export function filmsRoute(deps: FilmsRouteDeps): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: deps.maxVideoUploadBytes } });

  router.post('/api/films', async (req, res) => {
    const { title, script, videoUrl, testMode } = req.body ?? {};

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (script !== undefined && typeof script !== 'string') {
      res.status(400).json({ error: 'script must be a string' });
      return;
    }
    if (typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    let finalVideoUrl = videoUrl;
    if (!videoUrl.startsWith('gs://') && !isMockRequest(testMode)) {
      try {
        finalVideoUrl = await deps.videoBucketUploader.uploadFromUrl(videoUrl);
      } catch (err) {
        res.status(502).json({
          error: `failed to upload video to bucket: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
        return;
      }
    }

    const film = deps.filmStore.createFilm({ title, script: script ?? '', videoUrl: finalVideoUrl });
    res.status(201).json(film);
  });

  // Passcode is taken from the query string here (not the body): the passcode
  // middleware runs before multer parses the multipart body.
  router.post('/api/films/upload-video', (req, res, next) => {
    upload.single('video')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: `video exceeds the ${deps.maxVideoUploadBytes}-byte upload limit` });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : 'invalid upload' });
        return;
      }
      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'video file is required' });
      return;
    }
    if (!file.mimetype.startsWith('video/') && file.mimetype !== 'application/octet-stream') {
      res.status(400).json({ error: `uploaded file does not look like a video (content-type "${file.mimetype}")` });
      return;
    }

    if (isMockRequest(req.body?.testMode)) {
      res.status(200).json({ videoUrl: `gs://mock-bucket/${randomUUID()}${guessExtension(file.originalname)}` });
      return;
    }

    try {
      const videoUrl = await deps.videoBucketUploader.uploadBuffer({
        buffer: file.buffer,
        filename: file.originalname,
        contentType: file.mimetype,
      });
      res.status(200).json({ videoUrl });
    } catch (err) {
      res.status(502).json({
        error: `failed to upload video to bucket: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
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

  router.post('/api/films/:id/preprocessing', (req, res) => {
    const { dialogue, gestures } = req.body ?? {};
    if (!Array.isArray(dialogue) || !Array.isArray(gestures)) {
      res.status(400).json({ error: 'dialogue and gestures arrays are required' });
      return;
    }

    const film = deps.filmStore.updatePreprocessing(req.params.id, { dialogue, gestures });
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    res.status(200).json(film);
  });

  router.delete('/api/films/:id', (req, res) => {
    const deleted = deps.filmStore.deleteFilm(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    res.status(204).end();
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

    // Prefer the real Discover Agent output once it exists; fall back to the mocked
    // fixture details only for a film that hasn't been through Discover Agent yet.
    const items = film.preprocessing
      ? preprocessingToItems(film.preprocessing)
      : film.details.map((d) => ({ scriptLine: d.scriptLine, sceneDescription: d.sceneDescription }));

    const project = deps.projectStore.createProject({
      name: `${country}-${film.title}`,
      country,
      items,
      rubrics: Array.isArray(rubrics) && rubrics.length > 0 ? rubrics : deps.defaultRubrics,
    });
    res.status(201).json(project);
  });

  return router;
}
