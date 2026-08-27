import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { preprocessVideo } from '../../frontend/src/api/apiClient';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeCaptioningClient } from './helpers/fakeCaptioningClient';

const TEST_PASSCODE = 'integration-test-passcode';

describe('frontend apiClient -> real backend -> faked captioning client', () => {
  let backend: TestBackend;

  beforeAll(async () => {
    backend = await startTestBackend({
      config: {
        sharedPasscode: TEST_PASSCODE,
        rateLimitWindowMs: 60_000,
        rateLimitMax: 1000,
      },
      captioningClient: fakeCaptioningClient({
        dialogue: [{ timecode: '00:00', character: 'RILEY', text: "You've got this." }],
        gestures: [
          {
            timecode: '00:01',
            character: 'RILEY',
            gesture: 'thumbs up',
            expression: '',
            narrativeLoad: 'load_bearing',
            backgroundNote: '',
          },
        ],
      }),
    });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('returns dialogue and gesture logs end-to-end when the real apiClient calls the live backend', async () => {
    // No fetchImpl override — real fetch, real TCP, real Express app.
    // Only backend.captioningClient (injected above) is fake.
    const result = await preprocessVideo(
      { videoUrl: 'gs://bucket/clip.mp4', passcode: TEST_PASSCODE, testMode: false },
      { baseUrl: backend.url },
    );

    expect(result).toEqual({
      ok: true,
      dialogue: [{ timecode: '00:00', character: 'RILEY', text: "You've got this." }],
      gestures: [
        {
          timecode: '00:01',
          character: 'RILEY',
          gesture: 'thumbs up',
          expression: '',
          narrativeLoad: 'load_bearing',
          backgroundNote: '',
        },
      ],
    });
  });

  it('returns an error result when the passcode is wrong, and never reaches the fake captioning client', async () => {
    const captioningClient = fakeCaptioningClient();
    const wrongPasscodeBackend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
      captioningClient,
    });

    try {
      const result = await preprocessVideo(
        { videoUrl: 'gs://bucket/clip.mp4', passcode: 'wrong', testMode: false },
        { baseUrl: wrongPasscodeBackend.url },
      );
      expect(result).toEqual({ ok: false, message: 'invalid passcode' });
      expect(captioningClient.preprocessVideo).not.toHaveBeenCalled();
    } finally {
      await wrongPasscodeBackend.close();
    }
  });
});
