import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewFilmView } from './NewFilmView';
import * as filmsApiClient from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'f1',
    title: 'Sample',
    script: 'x',
    videoUrl: 'https://example.com/v.mp4',
    status: 'processed',
    details: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('NewFilmView', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.createFilm).mockReset();
    navigateMock.mockReset();
  });

  it('disables submit until title, video URL, and script are all filled in', async () => {
    render(
      <MemoryRouter>
        <NewFilmView passcode="secret" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^script$/i), 'a script');
    expect(screen.getByRole('button', { name: /add film/i })).not.toBeDisabled();
  });

  it('creates the film and navigates to its detail page on submit', async () => {
    vi.mocked(filmsApiClient.createFilm).mockResolvedValue(fakeFilm({ id: 'new-id' }));
    render(
      <MemoryRouter>
        <NewFilmView passcode="secret" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.type(screen.getByLabelText(/^script$/i), 'a script');
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(filmsApiClient.createFilm).toHaveBeenCalledWith({
      passcode: 'secret',
      title: 'Inside Out',
      script: 'a script',
      videoUrl: 'https://example.com/v.mp4',
    });
    expect(navigateMock).toHaveBeenCalledWith('/films/new-id');
  });

  it('shows an error message when film creation fails', async () => {
    vi.mocked(filmsApiClient.createFilm).mockRejectedValue(new Error('request failed with status 400'));
    render(
      <MemoryRouter>
        <NewFilmView passcode="secret" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/title/i), 'X');
    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.type(screen.getByLabelText(/^script$/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(await screen.findByText(/400/)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
