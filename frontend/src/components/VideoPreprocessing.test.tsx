import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoPreprocessing } from './VideoPreprocessing';
import * as apiClient from '../api/apiClient';

vi.mock('../api/apiClient');

describe('VideoPreprocessing', () => {
  beforeEach(() => {
    vi.mocked(apiClient.preprocessVideo).mockReset();
  });

  it('renders a video field, a disabled script field, and a submit button', () => {
    render(<VideoPreprocessing passcode="p" testMode={true} />);
    expect(screen.getByLabelText(/video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/script/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit for preprocessing/i })).toBeInTheDocument();
  });

  it('does not call the backend when videoUrl is empty', async () => {
    render(<VideoPreprocessing passcode="p" testMode={true} />);
    await userEvent.click(screen.getByRole('button', { name: /submit for preprocessing/i }));
    expect(apiClient.preprocessVideo).not.toHaveBeenCalled();
  });

  it('submits videoUrl, passcode and testMode, and renders the returned gesture logs', async () => {
    vi.mocked(apiClient.preprocessVideo).mockResolvedValue({
      ok: true,
      lines: [
        {
          timecode: '00:01',
          gesture: 'thumbs up',
          character: 'RILEY',
          narrativeLoad: 'load_bearing',
          backgroundNote: 'a mug on the desk',
        },
      ],
    });
    render(<VideoPreprocessing passcode="secret" testMode={false} />);

    await userEvent.type(screen.getByLabelText(/video/i), 'gs://bucket/clip.mp4');
    await userEvent.click(screen.getByRole('button', { name: /submit for preprocessing/i }));

    expect(apiClient.preprocessVideo).toHaveBeenCalledWith({
      videoUrl: 'gs://bucket/clip.mp4',
      passcode: 'secret',
      testMode: false,
    });
    expect(await screen.findByText('thumbs up')).toBeInTheDocument();
    expect(screen.getByText(/00:01/)).toBeInTheDocument();
    expect(screen.getByText('RILEY')).toBeInTheDocument();
    expect(screen.getByText('load_bearing')).toBeInTheDocument();
    expect(screen.getByText('a mug on the desk')).toBeInTheDocument();
  });

  it('shows a loading state while the request is in flight', async () => {
    let resolveFn!: (value: { ok: true; lines: [] }) => void;
    vi.mocked(apiClient.preprocessVideo).mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    render(<VideoPreprocessing passcode="p" testMode={true} />);
    await userEvent.type(screen.getByLabelText(/video/i), 'gs://bucket/clip.mp4');
    await userEvent.click(screen.getByRole('button', { name: /submit for preprocessing/i }));

    expect(screen.getByRole('status')).toBeInTheDocument();
    resolveFn({ ok: true, lines: [] });
  });

  it('shows an error message when the backend call fails', async () => {
    vi.mocked(apiClient.preprocessVideo).mockResolvedValue({ ok: false, message: 'boom' });
    render(<VideoPreprocessing passcode="p" testMode={true} />);
    await userEvent.type(screen.getByLabelText(/video/i), 'gs://bucket/clip.mp4');
    await userEvent.click(screen.getByRole('button', { name: /submit for preprocessing/i }));
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  it('renders a country field and a Do research button that does not call the backend', async () => {
    render(<VideoPreprocessing passcode="p" testMode={true} />);
    expect(screen.getByLabelText(/country/i)).toBeInTheDocument();
    const doResearch = screen.getByRole('button', { name: /do research/i });
    await userEvent.click(doResearch);
    expect(apiClient.preprocessVideo).not.toHaveBeenCalled();
  });
});
