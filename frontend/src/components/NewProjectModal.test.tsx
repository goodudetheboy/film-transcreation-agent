import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewProjectModal } from './NewProjectModal';
import * as filmsApiClient from '../api/filmsApiClient';
import * as projectsApiClient from '../api/projectsApiClient';
import type { DetailRow, Film, Project } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');
vi.mock('../api/projectsApiClient');

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'f1',
    title: 'Inside Out',
    videoUrl: 'https://example.com/io.mp4',
    subtitle: { fileUrl: 'https://example.com/io.srt', format: 'srt', entries: [] },
    runDiscoveryOnCreate: false,
    prep: { stage: 'ready', videoDone: true, subtitleDone: true, discoveryJobId: null, discoveryDone: false, finalizeDone: true, log: [] },
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  } as Film;
}

function fakeRow(overrides: Partial<DetailRow> = {}): DetailRow {
  return {
    id: 'r1',
    filmId: 'f1',
    startMs: 0,
    endMs: 2000,
    subtitleText: 'Hello there',
    values: { segmentDescription: '', gesture: '', notes: '', custom: {} },
    provenance: { type: 'user-marked' },
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Japan — Inside Out',
    country: 'Japan',
    sourceFilmId: 'f1',
    note: '',
    status: 'draft',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('NewProjectModal', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.getFilm).mockReset();
    vi.mocked(filmsApiClient.listDetails).mockReset();
    vi.mocked(filmsApiClient.createProjectFromFilm).mockReset();
    vi.mocked(projectsApiClient.getDefaultRubrics).mockReset();

    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.mocked(filmsApiClient.listDetails).mockResolvedValue({ rows: [fakeRow()], columns: [] });
    vi.mocked(filmsApiClient.createProjectFromFilm).mockResolvedValue({ project: fakeProject(), items: [] });
    vi.mocked(projectsApiClient.getDefaultRubrics).mockResolvedValue([
      { name: 'Food aversion', description: 'A food reference.', weight: 3, trendEligible: false },
      { name: 'Slang / meme reference', description: 'A slang or meme reference.', weight: 3, trendEligible: true },
    ]);
  });

  it('preserves each default rubric\'s trendEligible flag through to project creation, instead of silently dropping it', async () => {
    render(<NewProjectModal filmId="f1" testMode={true} onCreated={vi.fn()} onClose={vi.fn()} />);

    // Step 1: Project info.
    await screen.findByLabelText(/target country/i);
    await userEvent.click(screen.getByLabelText(/target country/i));
    await userEvent.click(await screen.findByRole('option', { name: /japan/i }));
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 2: Selected details.
    await userEvent.click(await screen.findByLabelText(/select all rows/i));
    await userEvent.click(screen.getByRole('button', { name: /^next \(/i }));

    // Step 3: Rubrics — generate the server's default set instead of typing rubrics by hand.
    await userEvent.click(await screen.findByRole('button', { name: /use default rubrics/i }));
    await screen.findByDisplayValue('Slang / meme reference');
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 4: Confirmation — skip the auto-kickoff so no extra API mocks are needed.
    await userEvent.click(await screen.findByLabelText(/kick off agentic research/i));
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => expect(filmsApiClient.createProjectFromFilm).toHaveBeenCalled());
    const [, payload] = vi.mocked(filmsApiClient.createProjectFromFilm).mock.calls[0];
    expect(payload.rubrics).toEqual([
      { name: 'Food aversion', description: 'A food reference.', weight: 3, trendEligible: false },
      { name: 'Slang / meme reference', description: 'A slang or meme reference.', weight: 3, trendEligible: true },
    ]);
  });
});
