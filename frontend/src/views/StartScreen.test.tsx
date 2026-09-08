import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StartScreen } from './StartScreen';
import * as filmsApiClient from '../api/filmsApiClient';
import * as projectsApiClient from '../api/projectsApiClient';
import type { EnrichedProject, Film } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');
vi.mock('../api/projectsApiClient');

function fakeProject(overrides: Partial<EnrichedProject> = {}): EnrichedProject {
  return {
    id: 'p1',
    name: 'Japan — Inside Out',
    country: 'Japan',
    sourceFilmId: 'f1',
    note: '',
    status: 'draft',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    pendingCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    needResearchCount: 0,
    agentStatus: null,
    ...overrides,
  };
}

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'f1',
    title: 'Inside Out',
    videoUrl: 'https://example.com/io.mp4',
    subtitle: {
      fileUrl: 'https://example.com/io.srt',
      format: 'srt',
      entries: [{ id: 'e1', index: 0, startMs: 0, endMs: 1000, text: 'Hi' }],
    },
    runDiscoveryOnCreate: false,
    prep: {
      stage: 'ready',
      videoDone: true,
      subtitleDone: true,
      discoveryJobId: null,
      discoveryDone: false,
      finalizeDone: true,
      log: [],
    },
    status: 'processed',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('StartScreen', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.listFilms).mockReset();
    vi.mocked(filmsApiClient.deleteFilm).mockReset();
    vi.mocked(projectsApiClient.listProjects).mockReset();
    vi.mocked(projectsApiClient.listProjects).mockResolvedValue([]);
  });

  it('shows a loading state, then the fetched films in the library half', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText('Inside Out')).toBeInTheDocument();
    expect(screen.getByText(/1 subtitle line/)).toBeInTheDocument();
    expect(screen.getByText('Processed')).toBeInTheDocument();
  });

  it('shows a project-count chip per film, derived from the projects list', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm(), fakeFilm({ id: 'f2', title: 'Your Body Count Is What?' })]);
    vi.mocked(projectsApiClient.listProjects).mockResolvedValue([
      fakeProject({ id: 'p1', sourceFilmId: 'f1' }),
      fakeProject({ id: 'p2', sourceFilmId: 'f1' }),
    ]);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/2 projects/)).toBeInTheDocument();
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no films', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(filmsApiClient.listFilms).mockRejectedValue(new Error('request failed with status 401'));
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/401/)).toBeInTheDocument();
  });

  it('the import half links to /films/new/preparing', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Import a new film')).toBeInTheDocument();
    expect(screen.getByText('Import a new film').closest('a')).toHaveAttribute('href', '/films/new/preparing');
  });

  it('deletes a film after confirming in the modal, and removes it from the library list', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    vi.mocked(filmsApiClient.deleteFilm).mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete film/i }));
    expect(await screen.findByText(/delete this film/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(filmsApiClient.deleteFilm).toHaveBeenCalledWith('f1');
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument();
  });

  it('does not delete when the confirmation modal is cancelled', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete film/i }));
    expect(await screen.findByText(/delete this film/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(filmsApiClient.deleteFilm).not.toHaveBeenCalled();
    expect(screen.getByText('Inside Out')).toBeInTheDocument();
  });
});
