import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FilmDetailView } from './FilmDetailView';
import * as filmsApiClient from '../api/filmsApiClient';
import * as apiClient from '../api/apiClient';
import type { Film, Project } from '../api/apiClient.types';

vi.mock('../api/filmsApiClient');
vi.mock('../api/apiClient');

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
    preprocessing: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Japan',
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

function renderAtFilm(id = 'f1', testMode = true) {
  return render(
    <MemoryRouter initialEntries={[`/films/${id}`]}>
      <Routes>
        <Route path="/films/:id" element={<FilmDetailView passcode="secret" testMode={testMode} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FilmDetailView', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.getFilm).mockReset();
    vi.mocked(filmsApiClient.savePreprocessing).mockReset();
    vi.mocked(filmsApiClient.deleteFilm).mockReset();
    vi.mocked(filmsApiClient.createProjectFromFilm).mockReset();
    vi.mocked(apiClient.preprocessVideo).mockReset();
    navigateMock.mockReset();
  });

  it('loads the film and shows the video and action buttons', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm();

    expect(await screen.findByText('Inside Out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discover agent/i })).toBeInTheDocument();
  });

  it('shows an error message when loading the film fails', async () => {
    vi.mocked(filmsApiClient.getFilm).mockRejectedValue(new Error('request failed with status 404'));
    renderAtFilm();
    expect(await screen.findByText(/404/)).toBeInTheDocument();
  });

  it('shows the mocked candidate details in test mode only', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm('f1', true);
    await screen.findByText('Inside Out');
    expect(screen.getByText("I'm not eating that broccoli.")).toBeInTheDocument();
  });

  it('hides the mocked candidate details in real mode', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm('f1', false);
    await screen.findByText('Inside Out');
    expect(screen.queryByText("I'm not eating that broccoli.")).not.toBeInTheDocument();
  });

  it('runs the Discover Agent flow, renders the timeline, and persists the result', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.mocked(apiClient.preprocessVideo).mockResolvedValue({
      ok: true,
      dialogue: [{ timecode: '00:05', character: 'Joy', text: 'Hello!' }],
      gestures: [],
    });
    vi.mocked(filmsApiClient.savePreprocessing).mockResolvedValue(
      fakeFilm({ preprocessing: { dialogue: [{ timecode: '00:05', character: 'Joy', text: 'Hello!' }], gestures: [] } }),
    );
    renderAtFilm('f1', true);
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /discover agent/i }));

    expect(apiClient.preprocessVideo).toHaveBeenCalledWith({
      videoUrl: 'https://example.com/io.mp4',
      passcode: 'secret',
      testMode: true,
    });
    expect(await screen.findByText(/Joy: “Hello!”/)).toBeInTheDocument();
    expect(filmsApiClient.savePreprocessing).toHaveBeenCalledWith('f1', {
      passcode: 'secret',
      dialogue: [{ timecode: '00:05', character: 'Joy', text: 'Hello!' }],
      gestures: [],
    });
  });

  it('shows an error when the Discover Agent call fails', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.mocked(apiClient.preprocessVideo).mockResolvedValue({ ok: false, message: 'boom' });
    renderAtFilm('f1', true);
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /discover agent/i }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('hydrates the timeline from previously saved preprocessing, without calling Discover Agent', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(
      fakeFilm({
        preprocessing: { dialogue: [{ timecode: '00:10', character: 'Sadness', text: 'Oh no.' }], gestures: [] },
      }),
    );
    renderAtFilm();

    expect(await screen.findByText(/Sadness: “Oh no.”/)).toBeInTheDocument();
    expect(apiClient.preprocessVideo).not.toHaveBeenCalled();
  });

  it('does not show the Create Project form before Discover Agent has produced output', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    renderAtFilm();
    await screen.findByText('Inside Out');

    expect(screen.queryByLabelText(/target country/i)).not.toBeInTheDocument();
  });

  it('shows the Create Project form once preprocessing output is present, and creates a project by country', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(
      fakeFilm({
        preprocessing: { dialogue: [{ timecode: '00:10', character: 'Sadness', text: 'Oh no.' }], gestures: [] },
      }),
    );
    vi.mocked(filmsApiClient.createProjectFromFilm).mockResolvedValue(fakeProject({ id: 'new-project-id' }));
    renderAtFilm();
    await screen.findByText('Inside Out');

    await userEvent.type(screen.getByLabelText(/target country/i), 'Japan');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(filmsApiClient.createProjectFromFilm).toHaveBeenCalledWith('f1', { passcode: 'secret', country: 'Japan' });
    expect(navigateMock).toHaveBeenCalledWith('/projects/new-project-id');
  });

  it('the Preprocessing Output section is a collapsible dropdown', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(
      fakeFilm({
        preprocessing: { dialogue: [{ timecode: '00:10', character: 'Sadness', text: 'Oh no.' }], gestures: [] },
      }),
    );
    renderAtFilm();

    const summary = await screen.findByText('Preprocessing Output');
    expect(summary.closest('details')).toHaveAttribute('open');
  });

  it('deletes the film after confirming, and navigates back to the film list', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.mocked(filmsApiClient.deleteFilm).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAtFilm();
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete film/i }));

    expect(filmsApiClient.deleteFilm).toHaveBeenCalledWith('f1', 'secret');
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('does not delete when the confirm prompt is declined', async () => {
    vi.mocked(filmsApiClient.getFilm).mockResolvedValue(fakeFilm());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAtFilm();
    await screen.findByText('Inside Out');

    await userEvent.click(screen.getByRole('button', { name: /delete film/i }));

    expect(filmsApiClient.deleteFilm).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
