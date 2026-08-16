import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { streamAnalyze } from '../../frontend/src/api/apiClient';
import type { AgentEvent } from '../../frontend/src/api/apiClient.types';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeDialogflowClient } from './helpers/fakeDialogflowClient';

const TEST_PASSCODE = 'integration-test-passcode';

describe('frontend apiClient -> real backend -> faked Dialogflow CX', () => {
  let backend: TestBackend;

  beforeAll(async () => {
    backend = await startTestBackend({
      config: {
        sharedPasscode: TEST_PASSCODE,
        rateLimitWindowMs: 60_000,
        rateLimitMax: 1000,
        revealDelayMs: 0,
      },
      dialogflowClient: fakeDialogflowClient([
        {
          line: "This is worse than a trip to the DMV.",
          reason: 'DMV is a US-specific institution',
          suggestedReplacement: 'This is worse than waiting for a train.',
        },
      ]),
    });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('streams a done event end-to-end when the real apiClient calls the live backend', async () => {
    // No fetchImpl override anywhere in this file — real fetch, real TCP, real Express app.
    // Only backend.dialogflowClient (injected above) is fake.
    const events: AgentEvent[] = [];
    await streamAnalyze(
      {
        script: "RILEY\nI'm not eating that broccoli.",
        targetCountry: 'Japan',
        passcode: TEST_PASSCODE,
        testMode: false, // must reach the injected fake dialogflowClient, not the default mock
      },
      (e) => events.push(e),
      { baseUrl: backend.url },
    );

    expect(events[0]).toMatchObject({ type: 'progress' });
    expect(events.some((e) => e.type === 'line_flagged')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalFlagged: 1 } });
  });

  it('rejects with an error event when the passcode is wrong, and never reaches the fake Dialogflow client', async () => {
    const dialogflowClient = fakeDialogflowClient([]);
    const wrongPasscodeBackend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000, revealDelayMs: 0 },
      dialogflowClient,
    });

    try {
      const events: AgentEvent[] = [];
      await streamAnalyze(
        { script: 'line one', targetCountry: 'Japan', passcode: 'wrong', testMode: false },
        (e) => events.push(e),
        { baseUrl: wrongPasscodeBackend.url },
      );
      expect(events).toEqual([{ type: 'error', message: expect.stringContaining('401') }]);
      expect(dialogflowClient.analyzeScript).not.toHaveBeenCalled();
    } finally {
      await wrongPasscodeBackend.close();
    }
  });

  it('surfaces a backend-side 429 as an error event after exceeding the configured rate limit', async () => {
    const limitedBackend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1, revealDelayMs: 0 },
      dialogflowClient: fakeDialogflowClient([]),
    });

    try {
      const payload = {
        script: 'line one',
        targetCountry: 'Japan',
        passcode: TEST_PASSCODE,
        testMode: false,
      };
      await streamAnalyze(payload, () => {}, { baseUrl: limitedBackend.url }); // consumes the only allowed request

      const events: AgentEvent[] = [];
      await streamAnalyze(payload, (e) => events.push(e), { baseUrl: limitedBackend.url });
      expect(events).toEqual([{ type: 'error', message: expect.stringContaining('429') }]);
    } finally {
      await limitedBackend.close();
    }
  });
});
