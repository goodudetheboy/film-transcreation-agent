import { describe, it, expect } from 'vitest';
import { toPlayableUrl } from './gsUrl';

describe('toPlayableUrl', () => {
  it('converts a gs:// URI to its public HTTPS equivalent', () => {
    expect(toPlayableUrl('gs://silent-scholar-505618-u6-clips/test.mp4')).toBe(
      'https://storage.googleapis.com/silent-scholar-505618-u6-clips/test.mp4',
    );
  });

  it('leaves non-gs:// URLs unchanged', () => {
    expect(toPlayableUrl('https://example.com/video.mp4')).toBe('https://example.com/video.mp4');
  });
});
