import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FilmsListView } from './FilmsListView';
import * as filmsApiClient from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'f1',
    title: 'Inside Out',
    script: 'placeholder',
    videoUrl: 'https://example.com/io.mp4',
    status: 'processed',
    details: [{ id: 'd1', scriptLine: 'a', sceneDescription: 'b' }],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('FilmsListView', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.listFilms).mockReset();
  });

  it('shows a loading state, then the fetched films', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([fakeFilm()]);
    render(
      <MemoryRouter>
        <FilmsListView passcode="secret" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText('Inside Out')).toBeInTheDocument();
    expect(screen.getByText('1 detail')).toBeInTheDocument();
    expect(screen.getByText('processed')).toBeInTheDocument();
  });

  it('shows an empty state when there are no films', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <FilmsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(filmsApiClient.listFilms).mockRejectedValue(new Error('request failed with status 401'));
    render(
      <MemoryRouter>
        <FilmsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/401/)).toBeInTheDocument();
  });

  it('links to /films/new for adding a new film', async () => {
    vi.mocked(filmsApiClient.listFilms).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <FilmsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /new film/i })).toHaveAttribute('href', '/films/new');
  });
});
