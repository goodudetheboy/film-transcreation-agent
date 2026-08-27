import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { CaptioningClient, CaptioningResult } from '../services/captioningClient.js';

const TEST_PASSCODE = 'test-passcode';

const EMPTY_RESULT: CaptioningResult = { dialogue: [], gestures: [] };

function fakeClient(result: CaptioningResult = EMPTY_RESULT): CaptioningClient {
  return { preprocessVideo: vi.fn().mockResolvedValue(result) };
}

function buildApp(
  captioningClient: CaptioningClient,
  overrides: { mockCaptioningClient?: CaptioningClient } = {},
) {
  return createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
    },
    captioningClient,
    mockCaptioningClient: overrides.mockCaptioningClient,
  });
}

describe('POST /api/preprocess-video', () => {
  it('returns 400 when videoUrl is missing', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/preprocess-video')
      .send({ passcode: TEST_PASSCODE, testMode: false });
    expect(res.status).toBe(400);
  });

  it('returns 401 when passcode is wrong', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/preprocess-video')
      .send({ passcode: 'wrong', videoUrl: 'gs://bucket/clip.mp4', testMode: false });
    expect(res.status).toBe(401);
  });

  it('returns the dialogue and gesture logs as JSON on success', async () => {
    const result: CaptioningResult = {
      dialogue: [{ timecode: '00:00', character: 'RILEY', text: "You've got this." }],
      gestures: [
        {
          timecode: '00:00',
          character: 'RILEY',
          gesture: 'thumbs up',
          expression: '',
          narrativeLoad: 'incidental',
          backgroundNote: '',
        },
      ],
    };
    const app = buildApp(fakeClient(result));
    const res = await request(app)
      .post('/api/preprocess-video')
      .send({ passcode: TEST_PASSCODE, videoUrl: 'gs://bucket/clip.mp4', testMode: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it('returns 500 with an error message when the client throws', async () => {
    const client: CaptioningClient = {
      preprocessVideo: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const app = buildApp(client);
    const res = await request(app)
      .post('/api/preprocess-video')
      .send({ passcode: TEST_PASSCODE, videoUrl: 'gs://bucket/clip.mp4', testMode: false });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });

  describe('test mode', () => {
    it('defaults to test mode (mock client) when testMode is omitted, never touching the real captioningClient', async () => {
      const real = fakeClient({
        dialogue: [],
        gestures: [
          {
            timecode: '00:00',
            character: 'A',
            gesture: 'real',
            expression: '',
            narrativeLoad: 'incidental',
            backgroundNote: '',
          },
        ],
      });
      const mock = fakeClient({
        dialogue: [],
        gestures: [
          {
            timecode: '00:00',
            character: 'A',
            gesture: 'mock',
            expression: '',
            narrativeLoad: 'incidental',
            backgroundNote: '',
          },
        ],
      });
      const app = buildApp(real, { mockCaptioningClient: mock });

      const res = await request(app)
        .post('/api/preprocess-video')
        .send({ passcode: TEST_PASSCODE, videoUrl: 'gs://bucket/clip.mp4' });

      expect(res.body).toEqual({
        dialogue: [],
        gestures: [
          {
            timecode: '00:00',
            character: 'A',
            gesture: 'mock',
            expression: '',
            narrativeLoad: 'incidental',
            backgroundNote: '',
          },
        ],
      });
      expect(real.preprocessVideo).not.toHaveBeenCalled();
    });

    it('uses the real captioningClient when testMode is explicitly false', async () => {
      const real = fakeClient({
        dialogue: [],
        gestures: [
          {
            timecode: '00:00',
            character: 'A',
            gesture: 'real',
            expression: '',
            narrativeLoad: 'incidental',
            backgroundNote: '',
          },
        ],
      });
      const mock = fakeClient({
        dialogue: [],
        gestures: [
          {
            timecode: '00:00',
            character: 'A',
            gesture: 'mock',
            expression: '',
            narrativeLoad: 'incidental',
            backgroundNote: '',
          },
        ],
      });
      const app = buildApp(real, { mockCaptioningClient: mock });

      await request(app)
        .post('/api/preprocess-video')
        .send({ passcode: TEST_PASSCODE, videoUrl: 'gs://bucket/clip.mp4', testMode: false });

      expect(real.preprocessVideo).toHaveBeenCalled();
      expect(mock.preprocessVideo).not.toHaveBeenCalled();
    });
  });
});
