import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createProject, streamResearch } from '../../frontend/src/api/projectsApiClient';
import type { ResearchStreamEvent } from '../../frontend/src/api/apiClient.types';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeDialogflowClient } from './helpers/fakeDialogflowClient';
import { fakeResearchAgent } from './helpers/fakeResearchAgent';

const TEST_PASSCODE = 'integration-test-passcode';

describe('frontend projectsApiClient -> real backend -> faked research agent', () => {
  let backend: TestBackend;

  beforeAll(async () => {
    backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
      dialogflowClient: fakeDialogflowClient([]),
      researchAgent: fakeResearchAgent([
        [
          {
            itemId: 'placeholder',
            targetCountry: 'Japan',
            findings: [
              {
                rubricId: 'food-aversion',
                reasonToChange:
                  "Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids.",
                evidence:
                  "Documented case: Pixar re-animated this exact line for Inside Out's Japanese release, swapping in green peppers.",
                sources: ['https://www.businessinsider.com/inside-out-pixar-broccoli-japan-2015-6'],
                changeDirection: 'Swap the disliked food for one Japanese kids commonly dislike.',
              },
            ],
          },
        ],
      ]),
    });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('creates a project via the real backend, then streams research progress end-to-end from the faked agent', async () => {
    // No fetchImpl override anywhere in this file — real fetch, real TCP, real Express app.
    // Only backend.researchAgent (injected above) is fake.
    const project = await createProject(
      {
        passcode: TEST_PASSCODE,
        country: 'Japan',
        items: [
          {
            scriptLine: "I'm not eating that broccoli.",
            sceneDescription: 'Riley pushes a plate of broccoli away at the dinner table',
          },
        ],
      },
      { baseUrl: backend.url },
    );

    expect(project.id).toBeTruthy();
    expect(project.status).toBe('draft');
    expect(project.items).toHaveLength(1);

    const events: ResearchStreamEvent[] = [];
    await streamResearch(
      project.id,
      { passcode: TEST_PASSCODE, testMode: false }, // must reach the injected fake researchAgent, not the default mock
      (e) => events.push(e),
      { baseUrl: backend.url },
    );

    expect(events[0]).toMatchObject({ type: 'progress' });
    const batchEvents = events.filter((e) => e.type === 'batch_done');
    expect(batchEvents).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalItems: 1, totalFindings: 1 } });
  });

  it('rejects project creation with an error when the passcode is wrong', async () => {
    await expect(
      createProject(
        { passcode: 'wrong', country: 'Japan', items: [{ scriptLine: 'x', sceneDescription: 'y' }] },
        { baseUrl: backend.url },
      ),
    ).rejects.toThrow(/401/);
  });
});
