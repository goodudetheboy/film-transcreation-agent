import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { Router, type Response } from 'express';
import multer from 'multer';
import type { DetailRowsStore } from '../services/detailRowsStore.js';
import type { DiscoveryEventBus } from '../services/discoveryEventBus.js';
import type { DiscoveryJob, DiscoveryJobStore } from '../services/discoveryJobStore.js';
import { detailRowsToProjectItems } from '../services/detailRowsToProjectItems.js';
import type { FilmPrep, FilmStore } from '../services/filmStore.js';
import type { FilmPrepPipeline } from '../services/filmPrepPipeline.js';
import type { ProjectStore } from '../services/projectStore.js';
import type { Rubric } from '../services/researchAgent.js';
import { parseSubtitleFile } from '../services/subtitleParser.js';
import { subtitleTextForRange } from '../services/subtitleOverlap.js';
import { simulateDelay } from '../services/testDelay.js';
import { guessExtension, type VideoBucketUploader } from '../services/videoBucketUploader.js';

export interface FilmsRouteDeps {
  filmStore: FilmStore;
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  projectStore: ProjectStore;
  defaultRubrics: Rubric[];
  videoBucketUploader: VideoBucketUploader;
  maxVideoUploadBytes: number;
  maxSubtitleUploadBytes: number;
  subtitleUploadPrefix: string;
  eventBus: DiscoveryEventBus;
  filmPrepPipeline: FilmPrepPipeline;
  mockDelayScale: number;
  mockUploadsDir: string;
}

function isMockRequest(testMode: unknown): boolean {
  // Same convention as elsewhere in this app: multipart form fields arrive as
  // strings, so "false" (not just false) must opt out of mock mode.
  return testMode !== false && testMode !== 'false';
}

function writeSSE(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function toJobSummary(job: DiscoveryJob) {
  const { conversationHistory: _c, log: _l, resultRows: _r, commentHistory: _ch, ...summary } = job;
  return summary;
}

function toPublicJob(job: DiscoveryJob) {
  const { conversationHistory: _c, ...publicJob } = job;
  return publicJob;
}

export function filmsRoute(deps: FilmsRouteDeps): Router {
  const router = Router();
  // Video uses diskStorage, not memoryStorage: a real film can be hundreds of MB
  // to a few GB, and memoryStorage buffers the *entire* upload into the Node
  // process's RAM before the handler even runs. Streaming straight to disk keeps
  // memory flat regardless of file size. Subtitle files are tiny text, so
  // memoryStorage there is fine and simpler.
  mkdirSync(deps.mockUploadsDir, { recursive: true });
  const uploadVideo = multer({
    storage: multer.diskStorage({
      destination: deps.mockUploadsDir,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${guessExtension(file.originalname)}`),
    }),
    limits: { fileSize: deps.maxVideoUploadBytes },
  });
  const uploadSubtitle = multer({ storage: multer.memoryStorage(), limits: { fileSize: deps.maxSubtitleUploadBytes } });

  // ---- Uploads ----------------------------------------------------------

  router.post(
    '/api/films/upload-video',
    (req, res, next) => {
      uploadVideo.single('video')(req, res, (err: unknown) => {
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
    },
    async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'video file is required' });
        return;
      }

      // diskStorage already wrote the upload to deps.mockUploadsDir under
      // file.filename before this handler runs — every path below either keeps
      // it there (mock mode) or must clean it up (validation failure, or after
      // it's been read and forwarded to the real bucket).
      let keepFile = false;
      try {
        if (!file.mimetype.startsWith('video/') && file.mimetype !== 'application/octet-stream') {
          res.status(400).json({ error: `uploaded file does not look like a video (content-type "${file.mimetype}")` });
          return;
        }

        if (isMockRequest(req.body?.testMode)) {
          await simulateDelay({ minMs: 800, maxMs: 1500 }, deps.mockDelayScale);
          keepFile = true;

          // A <video> GET can't carry a passcode header/body — ride along as a query
          // param, same lookup passcodeMiddleware already used to authorize this POST.
          const passcode = req.body?.passcode ?? req.query?.passcode ?? '';
          const origin = `${req.protocol}://${req.get('host')}`;
          const videoUrl = `${origin}/mock-uploads/${file.filename}?passcode=${encodeURIComponent(String(passcode))}`;

          res.status(200).json({ videoUrl });
          return;
        }

        const buffer = await readFile(file.path);
        const videoUrl = await deps.videoBucketUploader.uploadBuffer({
          buffer,
          filename: file.originalname,
          contentType: file.mimetype,
        });
        res.status(200).json({ videoUrl });
      } catch (err) {
        res.status(502).json({
          error: `failed to upload video to bucket: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      } finally {
        if (!keepFile) await rm(file.path, { force: true }).catch(() => {});
      }
    },
  );

  // Real-mode video uploads never touch this backend's body at all: Cloud Run
  // enforces a hard, non-configurable 32MB request-size limit (GFE-level, "cannot
  // be increased" per Google's quotas docs) that a multipart video upload blows
  // past instantly. This route just mints a GCS resumable-upload session; the
  // browser then PUTs the bytes straight to storage.googleapis.com. Mock mode
  // keeps using the multer route above unchanged — it's for small test clips.
  router.post('/api/films/upload-video/init', async (req, res) => {
    const { filename, contentType, size, testMode } = req.body ?? {};

    if (isMockRequest(testMode)) {
      res.status(400).json({ error: 'upload-video/init is not used in mock mode' });
      return;
    }
    if (typeof filename !== 'string' || filename.trim() === '') {
      res.status(400).json({ error: 'filename is required' });
      return;
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: 'size is required and must be a positive number' });
      return;
    }
    if (size > deps.maxVideoUploadBytes) {
      res.status(413).json({ error: `video exceeds the ${deps.maxVideoUploadBytes}-byte upload limit` });
      return;
    }

    try {
      const { uploadUrl, videoUrl } = await deps.videoBucketUploader.createResumableUploadSession({
        filename,
        contentType: typeof contentType === 'string' ? contentType : 'video/mp4',
      });
      res.status(200).json({ uploadUrl, videoUrl });
    } catch (err) {
      res.status(502).json({
        error: `failed to start video upload session: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
  });

  // GCS's resumable-upload completion response never carries CORS headers
  // (confirmed empirically — every intermediate 308 does, the finalizing 200
  // never does), so a browser's fetch() can never read confirmation of its
  // own upload directly — it always throws, whether the upload actually
  // succeeded or not. The frontend sends the bytes, then calls this route so
  // the backend (unaffected by CORS) verifies completion. This also enforces
  // the real size cap server-side: the client declares a size at /init time,
  // but nothing stops it lying, since GCS itself doesn't cap a resumable
  // session's total from what was declared at creation.
  router.post('/api/films/upload-video/finalize', async (req, res) => {
    const { videoUrl, testMode } = req.body ?? {};

    if (isMockRequest(testMode)) {
      res.status(400).json({ error: 'upload-video/finalize is not used in mock mode' });
      return;
    }
    if (typeof videoUrl !== 'string' || !videoUrl.startsWith('gs://')) {
      res.status(400).json({ error: 'videoUrl must be a gs:// URI' });
      return;
    }

    try {
      const size = await deps.videoBucketUploader.getObjectSizeBytes(videoUrl);
      if (size === null) {
        res.status(404).json({ error: 'video upload has not finished yet' });
        return;
      }
      if (size > deps.maxVideoUploadBytes) {
        await deps.videoBucketUploader.deleteObject(videoUrl).catch(() => {});
        res.status(413).json({ error: `video exceeds the ${deps.maxVideoUploadBytes}-byte upload limit (actual size ${size} bytes)` });
        return;
      }
      res.status(200).json({ ok: true, size });
    } catch (err) {
      res.status(502).json({
        error: `failed to verify uploaded video: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
  });

  router.post(
    '/api/films/upload-subtitle',
    (req, res, next) => {
      uploadSubtitle.single('subtitle')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: `subtitle exceeds the ${deps.maxSubtitleUploadBytes}-byte upload limit` });
            return;
          }
          res.status(400).json({ error: err instanceof Error ? err.message : 'invalid upload' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'subtitle file is required' });
        return;
      }

      const lowerName = file.originalname.toLowerCase();
      const format: 'srt' | 'vtt' | null = lowerName.endsWith('.srt') ? 'srt' : lowerName.endsWith('.vtt') ? 'vtt' : null;
      if (!format) {
        res.status(400).json({ error: 'subtitle file must be .srt or .vtt' });
        return;
      }

      let entries;
      try {
        entries = parseSubtitleFile(file.buffer.toString('utf-8'), format);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'failed to parse subtitle file' });
        return;
      }

      if (isMockRequest(req.body?.testMode)) {
        await simulateDelay({ minMs: 800, maxMs: 1500 }, deps.mockDelayScale);
        res.status(200).json({ subtitleUrl: `gs://mock-bucket/${deps.subtitleUploadPrefix}${randomUUID()}.${format}`, format, entries });
        return;
      }

      try {
        const subtitleUrl = await deps.videoBucketUploader.uploadBuffer({
          buffer: file.buffer,
          filename: file.originalname,
          contentType: 'text/plain',
          objectPrefix: deps.subtitleUploadPrefix,
        });
        res.status(200).json({ subtitleUrl, format, entries });
      } catch (err) {
        res.status(502).json({
          error: `failed to upload subtitle to bucket: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      }
    },
  );

  // ---- Film creation & prep ----------------------------------------------

  router.post('/api/films', async (req, res) => {
    const { title, videoUrl, subtitleUrl, subtitleFormat, subtitleEntries, runDiscovery, testMode } = req.body ?? {};

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }
    if (typeof subtitleUrl !== 'string' || subtitleUrl.trim() === '') {
      res.status(400).json({ error: 'subtitleUrl is required — upload a video and a subtitle file before creating the film' });
      return;
    }
    if (subtitleFormat !== 'srt' && subtitleFormat !== 'vtt') {
      res.status(400).json({ error: 'subtitleFormat must be "srt" or "vtt"' });
      return;
    }
    if (!Array.isArray(subtitleEntries) || subtitleEntries.length === 0) {
      res.status(400).json({ error: 'subtitleEntries must be a non-empty array' });
      return;
    }

    const film = await deps.filmStore.createFilm({
      title,
      videoUrl,
      subtitle: { fileUrl: subtitleUrl, format: subtitleFormat, entries: subtitleEntries },
      runDiscoveryOnCreate: Boolean(runDiscovery),
    });

    res.status(201).json(film);

    // Fire-and-forget: the prep screen observes progress via prep-status SSE below.
    void deps.filmPrepPipeline.run(film.id, isMockRequest(testMode));
  });

  router.get('/api/films/:id/prep-status', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    const isTerminal = (prep: FilmPrep) => prep.stage === 'ready' || prep.stage === 'error';
    const send = (prep: FilmPrep) => writeSSE(res, { type: 'prep_update', prep });

    if (isTerminal(film.prep)) {
      send(film.prep);
      res.end();
      return;
    }

    const unsubscribe = deps.eventBus.subscribe(`filmPrep:${film.id}`, (event) => {
      const e = event as { type: 'prep_update'; prep: FilmPrep };
      send(e.prep);
      if (isTerminal(e.prep)) {
        unsubscribe();
        res.end();
      }
    });
    req.on('close', unsubscribe);

    // Re-check after subscribing, in case prep finished between our first read and now.
    const latest = await deps.filmStore.getFilm(film.id);
    if (latest && isTerminal(latest.prep)) {
      send(latest.prep);
      unsubscribe();
      res.end();
    } else if (latest) {
      send(latest.prep);
    }
  });

  // ---- Films ---------------------------------------------------------------

  router.get('/api/films', async (_req, res) => {
    res.status(200).json(await deps.filmStore.listFilms());
  });

  router.get('/api/films/:id', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    res.status(200).json(film);
  });

  router.delete('/api/films/:id', async (req, res) => {
    const deleted = await deps.filmStore.deleteFilm(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    res.status(204).end();
  });

  // ---- Details table ---------------------------------------------------------

  router.get('/api/films/:id/details', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const [rows, columns] = await Promise.all([
      deps.detailRowsStore.listRows(film.id),
      deps.detailRowsStore.listColumns(film.id),
    ]);
    res.status(200).json({ rows, columns });
  });

  router.post('/api/films/:id/details', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const { startMs, endMs, values } = req.body ?? {};
    if (typeof startMs !== 'number' || typeof endMs !== 'number' || startMs < 0 || endMs <= startMs) {
      res.status(400).json({ error: 'startMs/endMs must be numbers with endMs > startMs >= 0' });
      return;
    }

    const row = await deps.detailRowsStore.addRow(film.id, {
      startMs,
      endMs,
      subtitleText: subtitleTextForRange(film.subtitle?.entries ?? [], startMs, endMs),
      values: values ?? {},
      provenance: { type: 'user-marked' },
    });
    res.status(201).json(row);
  });

  router.patch('/api/films/:id/details/:rowId', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const { startMs, endMs, values } = req.body ?? {};

    const patch: { startMs?: number; endMs?: number; subtitleText?: string; values?: unknown } = {};
    if (startMs !== undefined || endMs !== undefined) {
      if (typeof startMs !== 'number' || typeof endMs !== 'number' || startMs < 0 || endMs <= startMs) {
        res.status(400).json({ error: 'startMs/endMs must be numbers with endMs > startMs >= 0' });
        return;
      }
      patch.startMs = startMs;
      patch.endMs = endMs;
      patch.subtitleText = subtitleTextForRange(film.subtitle?.entries ?? [], startMs, endMs);
    }
    if (values !== undefined) patch.values = values;

    const row = await deps.detailRowsStore.updateRow(
      film.id,
      req.params.rowId,
      patch as Parameters<DetailRowsStore['updateRow']>[2],
    );
    if (!row) {
      res.status(404).json({ error: 'detail row not found' });
      return;
    }
    res.status(200).json(row);
  });

  router.delete('/api/films/:id/details/:rowId', async (req, res) => {
    const deleted = await deps.detailRowsStore.deleteRow(req.params.id, req.params.rowId);
    if (!deleted) {
      res.status(404).json({ error: 'detail row not found' });
      return;
    }
    res.status(204).end();
  });

  router.post('/api/films/:id/columns', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const { name, description } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const column = await deps.detailRowsStore.addColumn(film.id, name.trim(), typeof description === 'string' ? description.trim() : '');
    res.status(201).json(column);
  });

  // ---- Discovery agent passes ---------------------------------------------

  router.post('/api/films/:id/discovery-jobs', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    if (!film.subtitle) {
      res.status(400).json({ error: 'film has no parsed subtitle to anchor a discovery pass to' });
      return;
    }

    const { agentNumber, name, specialInstruction, targetColumns, testMode } = req.body ?? {};
    if (!Array.isArray(targetColumns) || targetColumns.length === 0) {
      res.status(400).json({ error: 'targetColumns must be a non-empty array' });
      return;
    }
    if (agentNumber !== undefined && typeof agentNumber !== 'number') {
      res.status(400).json({ error: 'agentNumber must be a number' });
      return;
    }

    const job = await deps.discoveryJobStore.createJob({
      filmId: film.id,
      agentNumber,
      name: typeof name === 'string' ? name : null,
      specialInstruction: typeof specialInstruction === 'string' ? specialInstruction : '',
      targetColumns,
      testMode: isMockRequest(testMode),
    });
    res.status(201).json(toPublicJob(job));
  });

  router.get('/api/films/:id/discovery-jobs', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }
    const jobs = await deps.discoveryJobStore.listJobs(film.id);
    res.status(200).json(jobs.map(toJobSummary));
  });

  router.get('/api/films/:id/discovery-jobs/:jobId', async (req, res) => {
    const job = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }
    res.status(200).json(toPublicJob(job));
  });

  router.get('/api/films/:id/discovery-jobs/:jobId/stream', async (req, res) => {
    const job = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    const isTerminal = (j: DiscoveryJob) => j.status === 'done' || j.status === 'error';
    const send = (j: DiscoveryJob) => writeSSE(res, { type: 'job_update', job: toPublicJob(j) });

    if (isTerminal(job)) {
      send(job);
      res.end();
      return;
    }

    const unsubscribe = deps.eventBus.subscribe(`discoveryJob:${job.id}`, (event) => {
      const e = event as { type: 'job_update'; job: DiscoveryJob };
      send(e.job);
      if (isTerminal(e.job)) {
        unsubscribe();
        res.end();
      }
    });
    req.on('close', unsubscribe);

    const latest = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (latest && isTerminal(latest)) {
      send(latest);
      unsubscribe();
      res.end();
    } else if (latest) {
      send(latest);
    }
  });

  router.post('/api/films/:id/discovery-jobs/:jobId/comment', async (req, res) => {
    const job = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }
    if (job.status === 'queued' || job.status === 'running') {
      res.status(409).json({ error: 'discovery job is still running' });
      return;
    }
    const { comment } = req.body ?? {};
    if (typeof comment !== 'string' || comment.trim() === '') {
      res.status(400).json({ error: 'comment is required' });
      return;
    }

    const now = new Date().toISOString();
    const updated = await deps.discoveryJobStore.updateJob(req.params.id, req.params.jobId, {
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      resultRows: [],
      commentHistory: [...job.commentHistory, { ts: now, comment }],
      log: [...job.log, { ts: now, message: 'Re-queued with your comment.' }],
    });
    res.status(200).json(toPublicJob(updated!));
  });

  router.post('/api/films/:id/discovery-jobs/:jobId/results/:resultRowId/add', async (req, res) => {
    const job = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }
    const result = job.resultRows.find((r) => r.tempId === req.params.resultRowId);
    if (!result) {
      res.status(404).json({ error: 'result row not found' });
      return;
    }

    const row = await deps.detailRowsStore.addRow(job.filmId, {
      startMs: result.startMs,
      endMs: result.endMs,
      subtitleText: result.subtitleText,
      values: {
        segmentDescription: result.values.segmentDescription,
        gesture: result.values.gesture,
        notes: result.values.notes,
        custom: result.values.custom,
      },
      provenance: { type: 'agent-discovered', jobId: job.id, agentNumber: job.agentNumber, passNumber: job.passNumber },
    });

    await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
      resultRows: job.resultRows.filter((r) => r.tempId !== result.tempId),
    });
    res.status(201).json(row);
  });

  router.delete('/api/films/:id/discovery-jobs/:jobId/results/:resultRowId', async (req, res) => {
    const job = await deps.discoveryJobStore.getJob(req.params.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'discovery job not found' });
      return;
    }
    if (!job.resultRows.some((r) => r.tempId === req.params.resultRowId)) {
      res.status(404).json({ error: 'result row not found' });
      return;
    }
    await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
      resultRows: job.resultRows.filter((r) => r.tempId !== req.params.resultRowId),
    });
    res.status(204).end();
  });

  // ---- Bridge to Project (Research) --------------------------------------

  router.post('/api/films/:id/create-project', async (req, res) => {
    const film = await deps.filmStore.getFilm(req.params.id);
    if (!film) {
      res.status(404).json({ error: 'film not found' });
      return;
    }

    const { country, rubrics } = req.body ?? {};
    if (typeof country !== 'string' || country.trim() === '') {
      res.status(400).json({ error: 'country is required' });
      return;
    }

    const rows = await deps.detailRowsStore.listRows(film.id);
    const items = detailRowsToProjectItems(rows);

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
