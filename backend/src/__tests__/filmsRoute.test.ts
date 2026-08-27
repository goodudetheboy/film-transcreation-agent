import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createFilmStore } from '../services/filmStore.js';
import type { FixtureDetail } from '../fixtures/insideOutDetails.js';

const TEST_PASSCODE = 'test-passcode';
const FIXTURE: FixtureDetail[] = [
  { scriptLine: 'a', sceneDescription: 'b' },
  { scriptLine: '', sceneDescription: 'c' },
];

function buildApp(
  overrides: {
    seedFilms?: Parameters<typeof createFilmStore>[1];
    videoBucketUploader?: { uploadFromUrl: ReturnType<typeof vi.fn>; uploadBuffer: ReturnType<typeof vi.fn> };
    maxVideoUploadBytes?: number;
  } = {},
) {
  return createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      ...(overrides.maxVideoUploadBytes !== undefined ? { maxVideoUploadBytes: overrides.maxVideoUploadBytes } : {}),
    },
    filmStore: createFilmStore(FIXTURE, overrides.seedFilms ?? []),
    videoBucketUploader: overrides.videoBucketUploader ?? { uploadFromUrl: vi.fn(), uploadBuffer: vi.fn() },
  });
}

describe('POST /api/films', () => {
  it('creates a film, already mock-processed with details', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', script: 'a script', videoUrl: 'https://example.com/v.mp4' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe('processed');
    expect(res.body.details).toHaveLength(2);
  });

  it('returns 400 when title or videoUrl is missing', async () => {
    const app = buildApp();
    const missingTitle = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, script: 'x', videoUrl: 'https://example.com/v.mp4' });
    expect(missingTitle.status).toBe(400);

    const missingUrl = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'X', script: 'x' });
    expect(missingUrl.status).toBe(400);
  });

  it('creates a film when script is omitted', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', videoUrl: 'https://example.com/v.mp4' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('does not upload to the bucket in test mode (default), storing the http URL as-is', async () => {
    const uploadFromUrl = vi.fn();
    const app = buildApp({ videoBucketUploader: { uploadFromUrl, uploadBuffer: vi.fn() } });
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', videoUrl: 'https://example.com/v.mp4', testMode: true });

    expect(res.status).toBe(201);
    expect(res.body.videoUrl).toBe('https://example.com/v.mp4');
    expect(uploadFromUrl).not.toHaveBeenCalled();
  });

  it('uploads an http video to the bucket when testMode is false, storing the resulting gs:// URI', async () => {
    const uploadFromUrl = vi.fn().mockResolvedValue('gs://test-bucket/abc123.mp4');
    const app = buildApp({ videoBucketUploader: { uploadFromUrl, uploadBuffer: vi.fn() } });
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', videoUrl: 'https://example.com/v.mp4', testMode: false });

    expect(res.status).toBe(201);
    expect(res.body.videoUrl).toBe('gs://test-bucket/abc123.mp4');
    expect(uploadFromUrl).toHaveBeenCalledWith('https://example.com/v.mp4');
  });

  it('does not upload a gs:// video even when testMode is false', async () => {
    const uploadFromUrl = vi.fn();
    const app = buildApp({ videoBucketUploader: { uploadFromUrl, uploadBuffer: vi.fn() } });
    const res = await request(app)
      .post('/api/films')
      .send({
        passcode: TEST_PASSCODE,
        title: 'New Film',
        videoUrl: 'gs://test-bucket/already-there.mp4',
        testMode: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.videoUrl).toBe('gs://test-bucket/already-there.mp4');
    expect(uploadFromUrl).not.toHaveBeenCalled();
  });

  it('returns 502 and creates no film when the bucket upload fails', async () => {
    const uploadFromUrl = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp({ videoBucketUploader: { uploadFromUrl, uploadBuffer: vi.fn() } });
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', videoUrl: 'https://example.com/v.mp4', testMode: false });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/boom/);

    const list = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(0);
  });
});

describe('POST /api/films/upload-video', () => {
  it('returns 400 when no file is attached', async () => {
    const app = buildApp();
    const res = await request(app).post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the uploaded file is not a video', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
      .attach('video', Buffer.from('not a video'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('skips the real upload in test mode and returns a placeholder gs:// URI', async () => {
    const uploadBuffer = vi.fn();
    const app = buildApp({ videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer } });
    const res = await request(app)
      .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
      .field('testMode', 'true')
      .attach('video', Buffer.from([1, 2, 3]), { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(200);
    expect(res.body.videoUrl).toMatch(/^gs:\/\//);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('uploads the file to the bucket when testMode is false', async () => {
    const uploadBuffer = vi.fn().mockResolvedValue('gs://test-bucket/uploaded-clip.mp4');
    const app = buildApp({ videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer } });
    const res = await request(app)
      .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
      .field('testMode', 'false')
      .attach('video', Buffer.from([1, 2, 3]), { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(200);
    expect(res.body.videoUrl).toBe('gs://test-bucket/uploaded-clip.mp4');
    expect(uploadBuffer).toHaveBeenCalledWith({
      buffer: Buffer.from([1, 2, 3]),
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    });
  });

  it('returns 413 when the file exceeds the configured max upload size', async () => {
    const app = buildApp({ maxVideoUploadBytes: 10 });
    const res = await request(app)
      .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
      .attach('video', Buffer.alloc(100), { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(413);
  });

  it('returns 502 and no gs:// URI when the bucket upload fails', async () => {
    const uploadBuffer = vi.fn().mockRejectedValue(new Error('boom'));
    const app = buildApp({ videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer } });
    const res = await request(app)
      .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
      .field('testMode', 'false')
      .attach('video', Buffer.from([1, 2, 3]), { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/boom/);
  });
});

describe('GET /api/films and /api/films/:id', () => {
  it('lists seeded films and fetches one by id', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });

    const list = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Inside Out');

    const fetched = await request(app).get(`/api/films/${list.body[0].id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Inside Out');
  });

  it('returns 404 for an unknown film id', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/films/does-not-exist?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/films/:id/preprocessing', () => {
  it('saves dialogue/gestures onto the film and returns it', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app)
      .post(`/api/films/${filmId}/preprocessing`)
      .send({
        passcode: TEST_PASSCODE,
        dialogue: [{ timecode: '00:01', character: 'Joy', text: 'Hi!' }],
        gestures: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.preprocessing.dialogue).toHaveLength(1);

    const fetched = await request(app).get(`/api/films/${filmId}?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.preprocessing.dialogue).toHaveLength(1);
  });

  it('returns 400 when dialogue or gestures is not an array', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app)
      .post(`/api/films/${filmId}/preprocessing`)
      .send({ passcode: TEST_PASSCODE, dialogue: 'not-an-array', gestures: [] });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the film does not exist', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films/does-not-exist/preprocessing')
      .send({ passcode: TEST_PASSCODE, dialogue: [], gestures: [] });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/films/:id', () => {
  it('deletes the film and it is no longer listed', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app).delete(`/api/films/${filmId}?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(204);

    const list = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 when the film does not exist', async () => {
    const app = buildApp();
    const res = await request(app).delete(`/api/films/does-not-exist?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/films/:id/create-project', () => {
  it('falls back to the mocked fixture details when the film has no Discover Agent output yet', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app)
      .post(`/api/films/${filmId}/create-project`)
      .send({ passcode: TEST_PASSCODE, country: 'Japan' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Japan-Inside Out');
    expect(res.body.country).toBe('Japan');
    expect(res.body.status).toBe('draft');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].sceneDescription).toBe('b');
    expect(res.body.rubrics.length).toBeGreaterThan(0);
  });

  it('builds items from the real Discover Agent output once the film has been preprocessed', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    await request(app)
      .post(`/api/films/${filmId}/preprocessing`)
      .send({
        passcode: TEST_PASSCODE,
        dialogue: [{ timecode: '00:01', character: 'Joy', text: 'Hello!' }],
        gestures: [],
      });

    const res = await request(app)
      .post(`/api/films/${filmId}/create-project`)
      .send({ passcode: TEST_PASSCODE, country: 'Japan' });

    expect(res.status).toBe(201);
    expect(res.body.items).toEqual([{ id: expect.any(String), scriptLine: 'Hello!', sceneDescription: 'Joy speaking' }]);
  });

  it('returns 404 when the film does not exist', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films/does-not-exist/create-project')
      .send({ passcode: TEST_PASSCODE, country: 'Japan' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when country is missing', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app).post(`/api/films/${filmId}/create-project`).send({ passcode: TEST_PASSCODE });
    expect(res.status).toBe(400);
  });
});
