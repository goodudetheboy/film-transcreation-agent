import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FilmDetailView } from './FilmDetailView';
import * as filmsApiClient from '../api/filmsApiClient';
import type { Film, Project } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'f1',
    title: 'Inside Out',
    script: 'placeholder',
    videoUrl: 'https://example.com/io.mp4',
    status: 'processed',
    details: [
      { id: 'd1', scriptLine: "I'm not eating that broccoli.", sceneDescription: 'Dinner table scene' },
      { id: 'd2', scriptLine: '', sceneDescription: 'Hockey rink scene' },
    ],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    country: 'Japan',
    items: [],
    rubrics: [],
    status: 'draft',
    batches: [],
    results: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderAtFilm(id = 'f1') {
  return render(
    <MemoryRouter initialEntries={[`/films/${id}`]}>
      <Routes>
        <Route path="/films/:id" element={<FilmDetailView passcode="secret" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FilmDetailView', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.getFilm).mockReset();
    vi.mocked(filmsApiClient.createProjectFromFilm).mockReset();
    navigateMock.mockReset();
  });

  it('loads the film and lists its candidate details', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm();

    expect(await screen.findByText('Inside Out')).toBeInTheDocument();
    expect(screen.getByText("I'm not eating that broccoli.")).toBeInTheDocument();
    expect(screen.getByText('Hockey rink scene')).toBeInTheDocument();
    expect(screen.getByText('2 candidate details · https://example.com/io.mp4')).toBeInTheDocument();
  });

  it('shows an error message when loading the film fails', async () => {
    vi.mocked(filmsApiClient.getFilm).mockRejectedValue(new Error('request failed with status 404'));
    renderAtFilm();
    expect(await screen.findByText(/404/)).toBeInTheDocument();
  });

  it('creates a project scoped to the entered country and navigates to it', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.mocked(filmsApiClient.createProjectFromFilm).mockResolvedValue(fakeProject({ id: 'new-project-id' }));
    renderAtFilm();
    await screen.findByText('Inside Out');

    await userEvent.type(screen.getByLabelText(/target country/i), 'Japan');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(filmsApiClient.createProjectFromFilm).toHaveBeenCalledWith('f1', {
      passcode: 'secret',
      country: 'Japan',
    });
    expect(navigateMock).toHaveBeenCalledWith('/projects/new-project-id');
  });

  it('disables Create Project until a country is entered', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm();
    await screen.findByText('Inside Out');
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled();
  });
});
