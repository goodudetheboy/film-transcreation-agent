import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ImportFilmPage } from './ImportFilmPage';
import * as filmsApiClient from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../api/filmsApiClient');

function makeFile(name: string, type: string): File {
  return new File(['content'], name, { type });
}

function fakeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'film-123',
    title: 'New Film',
    videoUrl: 'gs://bucket/video.mp4',
    subtitle: { fileUrl: 'gs://bucket/subs.srt', format: 'srt', entries: [] },
    runDiscoveryOnCreate: true,
    prep: {
      stage: 'discovery_running',
      videoDone: true,
      subtitleDone: true,
      discoveryJobId: null,
      discoveryDone: false,
      finalizeDone: false,
      log: [],
    },
    status: 'processing',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter>
      <ImportFilmPage passcode="secret" testMode={true} />
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Film' } });
  fireEvent.change(screen.getByLabelText('Video file'), { target: { files: [makeFile('clip.mp4', 'video/mp4')] } });
  fireEvent.change(screen.getByLabelText('Script file (.srt / .vtt)'), {
    target: { files: [makeFile('subs.srt', 'text/plain')] },
  });
}

describe('ImportFilmPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigate.mockReset();
    vi.mocked(filmsApiClient.uploadVideoFile).mockReset();
    vi.mocked(filmsApiClient.uploadSubtitleFile).mockReset();
    vi.mocked(filmsApiClient.createFilm).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sequences video-upload then subtitle-upload then film-creation, each held for the 3s floor, before navigating', async () => {
    vi.mocked(filmsApiClient.uploadVideoFile).mockResolvedValue({ videoUrl: 'gs://bucket/video.mp4' });
    vi.mocked(filmsApiClient.uploadSubtitleFile).mockResolvedValue({ subtitleUrl: 'gs://bucket/subs.srt', format: 'srt', entries: [] });
    vi.mocked(filmsApiClient.createFilm).mockResolvedValue(fakeFilm());

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Shows immediately even though the mocked upload already resolved —
    // proves the animation doesn't skip straight past the upload stages.
    expect(screen.getByText('Uploading your video…')).toBeInTheDocument();
    expect(screen.queryByText(/the FILM itself/)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('Uploading your script…')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/films/film-123/preparing');
  });

  it('surfaces an upload error immediately, without waiting out the 3s floor', async () => {
    vi.mocked(filmsApiClient.uploadVideoFile).mockRejectedValue(new Error('upload failed'));

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await vi.waitFor(() => expect(screen.getByText('upload failed')).toBeInTheDocument());
    expect(screen.getByLabelText('Video file')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
