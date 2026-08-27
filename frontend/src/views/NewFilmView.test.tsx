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
    preprocessing: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderView(testMode = true) {
  return render(
    <MemoryRouter>
      <NewFilmView passcode="secret" testMode={testMode} />
    </MemoryRouter>,
  );
}

describe('NewFilmView', () => {
  beforeEach(() => {
    vi.mocked(filmsApiClient.createFilm).mockReset();
    navigateMock.mockReset();
  });

  it('disables submit until title and video URL are filled in', async () => {
    renderView();
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    expect(screen.getByRole('button', { name: /add film/i })).not.toBeDisabled();
  });

  it('does not render a script field', () => {
    renderView();
    expect(screen.queryByLabelText(/^script$/i)).not.toBeInTheDocument();
  });

  it('creates the film with the current testMode and navigates to its detail page on submit', async () => {
    vi.mocked(filmsApiClient.createFilm).mockResolvedValue(fakeFilm({ id: 'new-id' }));
    renderView(false);

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(filmsApiClient.createFilm).toHaveBeenCalledWith({
      passcode: 'secret',
      title: 'Inside Out',
      script: '',
      videoUrl: 'https://example.com/v.mp4',
      testMode: false,
    });
    expect(navigateMock).toHaveBeenCalledWith('/films/new-id');
  });

  it('shows an uploading status while a real http video is being submitted', async () => {
    let resolveCreate: (film: Film) => void = () => {};
    vi.mocked(filmsApiClient.createFilm).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    renderView(false);

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(await screen.findByText(/uploading video to bucket/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeDisabled();

    resolveCreate(fakeFilm({ id: 'new-id' }));
  });

  it('does not create a film or navigate when submission fails', async () => {
    vi.mocked(filmsApiClient.createFilm).mockRejectedValue(new Error('request failed with status 400'));
    renderView();

    await userEvent.type(screen.getByLabelText(/title/i), 'X');
    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(await screen.findByText(/400/)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('enables submit once a file is chosen, without a video URL', async () => {
    renderView();
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    expect(screen.getByRole('button', { name: /add film/i })).toBeDisabled();

    await userEvent.upload(screen.getByTestId('video-file-input'), file);
    expect(screen.getByRole('button', { name: /add film/i })).not.toBeDisabled();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
  });

  it('choosing a file clears any typed video URL, and vice versa', async () => {
    renderView();
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v.mp4');
    await userEvent.upload(screen.getByTestId('video-file-input'), file);
    expect(screen.getByLabelText(/video url/i)).toHaveValue('');

    await userEvent.type(screen.getByLabelText(/video url/i), 'https://example.com/v2.mp4');
    expect(screen.queryByText('clip.mp4')).not.toBeInTheDocument();
  });

  it('uploads the chosen file first, then creates the film with the returned gs:// URI', async () => {
    vi.mocked(filmsApiClient.uploadVideoFile).mockResolvedValue({ videoUrl: 'gs://test-bucket/uploaded.mp4' });
    vi.mocked(filmsApiClient.createFilm).mockResolvedValue(fakeFilm({ id: 'new-id' }));
    renderView(false);
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.type(screen.getByLabelText(/title/i), 'Inside Out');
    await userEvent.upload(screen.getByTestId('video-file-input'), file);
    await userEvent.click(screen.getByRole('button', { name: /add film/i }));

    expect(filmsApiClient.uploadVideoFile).toHaveBeenCalledWith(file, { passcode: 'secret', testMode: false });
    expect(filmsApiClient.createFilm).toHaveBeenCalledWith({
      passcode: 'secret',
      title: 'Inside Out',
      script: '',
      videoUrl: 'gs://test-bucket/uploaded.mp4',
      testMode: false,
    });
    expect(navigateMock).toHaveBeenCalledWith('/films/new-id');
  });
});
