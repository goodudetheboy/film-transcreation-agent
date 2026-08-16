import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { streamAnalyze } from '../../frontend/src/api/apiClient';
import type { AgentEvent } from '../../frontend/src/api/apiClient.types';
import { startTestProxy, type TestProxy } from './helpers/startTestProxy';
import { fakeDialogflowClient } from './helpers/fakeDialogflowClient';

const TEST_PASSCODE = 'integration-test-passcode';

describe('frontend apiClient -> real proxy -> faked Dialogflow CX', () => {
  let proxy: TestProxy;

  beforeAll(async () => {
    proxy = await startTestProxy({
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
    await proxy.close();
  });

  it('streams a done event end-to-end when the real apiClient calls the live proxy', async () => {
    // No fetchImpl override anywhere in this file — real fetch, real TCP, real Express app.
    // Only proxy.dialogflowClient (injected above) is fake.
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: "RILEY\nI'm not eating that broccoli.", targetCountry: 'Japan', passcode: TEST_PASSCODE },
      (e) => events.push(e),
      { baseUrl: proxy.url },
    );

    expect(events[0]).toMatchObject({ type: 'progress' });
    expect(events.some((e) => e.type === 'line_flagged')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalFlagged: 1 } });
  });

  it('rejects with an error event when the passcode is wrong, and never reaches the fake Dialogflow client', async () => {
    const dialogflowClient = fakeDialogflowClient([]);
    const wrongPasscodeProxy = await startTestProxy({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000, revealDelayMs: 0 },
      dialogflowClient,
    });

    try {
      const events: AgentEvent[] = [];
      await streamAnalyze(
        { script: 'line one', targetCountry: 'Japan', passcode: 'wrong' },
        (e) => events.push(e),
        { baseUrl: wrongPasscodeProxy.url },
      );
      expect(events).toEqual([{ type: 'error', message: expect.stringContaining('401') }]);
      expect(dialogflowClient.analyzeScript).not.toHaveBeenCalled();
    } finally {
      await wrongPasscodeProxy.close();
    }
  });

  it('surfaces a proxy-side 429 as an error event after exceeding the configured rate limit', async () => {
    const limitedProxy = await startTestProxy({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1, revealDelayMs: 0 },
      dialogflowClient: fakeDialogflowClient([]),
    });

    try {
      const payload = { script: 'line one', targetCountry: 'Japan', passcode: TEST_PASSCODE };
      await streamAnalyze(payload, () => {}, { baseUrl: limitedProxy.url }); // consumes the only allowed request

      const events: AgentEvent[] = [];
      await streamAnalyze(payload, (e) => events.push(e), { baseUrl: limitedProxy.url });
      expect(events).toEqual([{ type: 'error', message: expect.stringContaining('429') }]);
    } finally {
      await limitedProxy.close();
    }
  });
});
