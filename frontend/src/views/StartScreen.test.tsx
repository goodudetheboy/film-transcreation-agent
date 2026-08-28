import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StartScreen } from './StartScreen';
import * as filmsApiClient from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');

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
  });

  it('shows a loading state, then the fetched films in the library half', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText('Inside Out')).toBeInTheDocument();
    expect(screen.getByText('1 subtitle line')).toBeInTheDocument();
    expect(screen.getByText('processed')).toBeInTheDocument();
  });

  it('shows an empty state when there are no films', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(filmsApiClient.listFilms).mockRejectedValue(new Error('request failed with status 401'));
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/401/)).toBeInTheDocument();
  });

  it('the import half links to /films/new', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Import a new film')).toBeInTheDocument();
    expect(screen.getByText('Import a new film').closest('a')).toHaveAttribute('href', '/films/new');
  });

  it('deletes a film after confirming, and removes it from the library list', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    vi.mocked(filmsApiClient.deleteFilm).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(filmsApiClient.deleteFilm).toHaveBeenCalledWith('f1', 'secret');
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument();
  });

  it('does not delete when the confirm prompt is declined', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <StartScreen passcode="secret" />
      </MemoryRouter>,
    );
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(filmsApiClient.deleteFilm).not.toHaveBeenCalled();
    expect(screen.getByText('Inside Out')).toBeInTheDocument();
  });
});
