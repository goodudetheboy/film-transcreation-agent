import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectDetailView } from './ProjectDetailView';
import { useProjectStore } from '../store/projectStore';
import * as projectsApiClient from '../api/projectsApiClient';
import type { Project, ResearchStreamEvent } from '../api/apiClient.types';

vi.mock('../api/projectsApiClient');

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Japan',
    country: 'Japan',
    items: [{ id: 'i1', scriptLine: "I'm not eating that broccoli.", sceneDescription: 'Riley pushes a plate away' }],
    rubrics: [{ id: 'food-aversion', description: 'x' }],
    status: 'draft',
    batches: [],
    results: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderAtProject(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${id}`]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailView passcode="secret" testMode={true} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectDetailView', () => {
  beforeEach(() => {
    vi.mocked(projectsApiClient.getProject).mockReset();
    vi.mocked(projectsApiClient.streamResearch).mockReset();
    useProjectStore.getState().reset();
  });

  it('loads the project and renders its items with a pending status', async () => {
    vi.mocked(projectsApiClient.getProject).mockResolvedValue(fakeProject());
    renderAtProject();

    expect(await screen.findByText(/project — japan/i)).toBeInTheDocument();
    expect(screen.getByText(/I'm not eating that broccoli./)).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows an error message when loading the project fails', async () => {
    vi.mocked(projectsApiClient.getProject).mockRejectedValue(new Error('request failed with status 404'));
    renderAtProject();
    expect(await screen.findByText(/404/)).toBeInTheDocument();
  });

  it('expands an item to show "not yet researched" before results arrive', async () => {
    vi.mocked(projectsApiClient.getProject).mockResolvedValue(fakeProject());
    renderAtProject();
    await screen.findByText(/I'm not eating that broccoli./);

    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/not yet researched/i)).toBeInTheDocument();
  });

  it('starts research, streams batch progress, and reveals findings when expanded', async () => {
    vi.mocked(projectsApiClient.getProject).mockResolvedValue(fakeProject());
    vi.mocked(projectsApiClient.streamResearch).mockImplementation(async (_id, _payload, onEvent) => {
      const events: ResearchStreamEvent[] = [
        { type: 'progress', message: 'researching (test mode)' },
        {
          type: 'batch_done',
          batchIndex: 0,
          totalBatches: 1,
          itemIds: ['i1'],
          results: [
            {
              itemId: 'i1',
              targetCountry: 'Japan',
              scores: [
                {
                  rubricId: 'food-aversion',
                  score: 9,
                  reasoning: 'reason',
                  evidence: 'evidence',
                  sources: ['https://example.com'],
                },
              ],
              summary: 'this should change',
              shouldTranscreate: true,
              suggestedReplacement: { text: 'replacement text', justification: 'because' },
            },
          ],
        },
        { type: 'done', summary: { totalItems: 1, totalRecommendedForChange: 1 } },
      ];
      for (const e of events) onEvent(e);
    });

    renderAtProject();
    await screen.findByText(/I'm not eating that broccoli./);

    await userEvent.click(screen.getByRole('button', { name: /start research/i }));

    expect(await screen.findByText('done')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('reason')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });
});
