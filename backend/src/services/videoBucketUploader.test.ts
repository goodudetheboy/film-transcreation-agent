import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

const dnsLookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => dnsLookupMock(...args),
}));

const createWriteStreamMock = vi.fn();
const deleteMock = vi.fn().mockResolvedValue(undefined);
const fileMock = vi.fn(() => ({
  createWriteStream: createWriteStreamMock,
  delete: deleteMock,
}));
const bucketMock = vi.fn(() => ({ file: fileMock }));
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket(...args: unknown[]) {
      return bucketMock(...args);
    }
  },
}));

const { createVideoBucketUploader } = await import('./videoBucketUploader.js');

function fakeResponse(
  body: Uint8Array[],
  opts: { status?: number; contentLength?: string; contentType?: string; ok?: boolean } = {},
) {
  let i = 0;
  const stream = {
    getReader: () => ({
      async read() {
        if (i < body.length) {
          return { done: false, value: body[i++] };
        }
        return { done: true, value: undefined };
      },
    }),
  };
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    body: stream,
    headers: {
      get: (name: string) => {
        if (name === 'content-length') return opts.contentLength ?? null;
        if (name === 'content-type') return opts.contentType ?? 'video/mp4';
        return null;
      },
    },
  } as unknown as Response;
}

describe('createVideoBucketUploader', () => {
  beforeEach(() => {
    dnsLookupMock.mockReset();
    createWriteStreamMock.mockReset();
    deleteMock.mockClear();
    fileMock.mockClear();
    bucketMock.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  const config = { bucketName: 'test-bucket', maxUploadBytes: 1_000_000 };

  it('rejects non-http(s) URLs without making a network call', async () => {
    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('file:///etc/passwd')).rejects.toThrow(/unsupported video URL scheme/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a literal loopback/private/link-local IP', async () => {
    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('http://127.0.0.1/video.mp4')).rejects.toThrow(/disallowed address/);
    await expect(uploader.uploadFromUrl('http://169.254.169.254/latest/metadata')).rejects.toThrow(/disallowed address/);
    await expect(uploader.uploadFromUrl('http://10.0.0.5/video.mp4')).rejects.toThrow(/disallowed address/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '192.168.1.5', family: 4 }]);
    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('http://internal.example.com/video.mp4')).rejects.toThrow(/disallowed address/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a URL that returns an HTML page instead of a video (e.g. a YouTube watch URL)', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(fakeResponse([new Uint8Array([1])], { contentType: 'text/html; charset=UTF-8' }));
    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('http://example.com/watch?v=abc')).rejects.toThrow(
      /does not point to a direct video file/,
    );
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('rejects when the declared content-length exceeds the max', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(fakeResponse([], { contentLength: '2000000' }));
    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('http://example.com/video.mp4')).rejects.toThrow(/too large/);
  });

  it('uploads a valid video and returns its gs:// URI', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      fakeResponse([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
    );
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c) => chunks.push(c));
    createWriteStreamMock.mockReturnValue(pass);

    const uploader = createVideoBucketUploader(config);
    const result = await uploader.uploadFromUrl('http://example.com/clip.mp4');

    expect(bucketMock).toHaveBeenCalledWith('test-bucket');
    expect(result).toMatch(/^gs:\/\/test-bucket\/[0-9a-f-]+\.mp4$/);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });

  it('deletes the partial object and rethrows when the stream exceeds the size cap mid-upload', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(fakeResponse([new Uint8Array(2_000_000)]));
    const pass = new PassThrough();
    pass.on('data', () => {});
    createWriteStreamMock.mockReturnValue(pass);

    const uploader = createVideoBucketUploader(config);
    await expect(uploader.uploadFromUrl('http://example.com/big.mp4')).rejects.toThrow(/exceeded/);
    expect(deleteMock).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  describe('uploadBuffer', () => {
    it('rejects a buffer larger than the max upload size', async () => {
      const uploader = createVideoBucketUploader(config);
      await expect(
        uploader.uploadBuffer({
          buffer: Buffer.alloc(2_000_000),
          filename: 'clip.mp4',
          contentType: 'video/mp4',
        }),
      ).rejects.toThrow(/too large/);
    });

    it('saves the buffer to the bucket and returns its gs:// URI', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined);
      fileMock.mockReturnValue({ createWriteStream: createWriteStreamMock, delete: deleteMock, save: saveMock });

      const uploader = createVideoBucketUploader(config);
      const result = await uploader.uploadBuffer({
        buffer: Buffer.from([1, 2, 3]),
        filename: 'clip.mov',
        contentType: 'video/quicktime',
      });

      expect(bucketMock).toHaveBeenCalledWith('test-bucket');
      expect(result).toMatch(/^gs:\/\/test-bucket\/[0-9a-f-]+\.mov$/);
      expect(saveMock).toHaveBeenCalledWith(
        Buffer.from([1, 2, 3]),
        expect.objectContaining({ contentType: 'video/quicktime' }),
      );
    });

    it('deletes the partial object and rethrows when the save fails', async () => {
      const saveMock = vi.fn().mockRejectedValue(new Error('gcs down'));
      fileMock.mockReturnValue({ createWriteStream: createWriteStreamMock, delete: deleteMock, save: saveMock });

      const uploader = createVideoBucketUploader(config);
      await expect(
        uploader.uploadBuffer({ buffer: Buffer.from([1]), filename: 'clip.mp4', contentType: 'video/mp4' }),
      ).rejects.toThrow('gcs down');
      expect(deleteMock).toHaveBeenCalledWith({ ignoreNotFound: true });
    });
  });

  describe('createResumableUploadSession', () => {
    it('mints a resumable session and returns the upload URL plus the eventual gs:// URI', async () => {
      const createResumableUploadMock = vi.fn().mockResolvedValue(['https://storage.googleapis.com/upload/session-123']);
      fileMock.mockReturnValue({
        createWriteStream: createWriteStreamMock,
        delete: deleteMock,
        createResumableUpload: createResumableUploadMock,
      });

      const uploader = createVideoBucketUploader(config);
      const result = await uploader.createResumableUploadSession({ filename: 'clip.mov', contentType: 'video/quicktime' });

      expect(bucketMock).toHaveBeenCalledWith('test-bucket');
      expect(fileMock).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]+\.mov$/));
      expect(createResumableUploadMock).toHaveBeenCalledWith({ metadata: { contentType: 'video/quicktime' } });
      expect(result.uploadUrl).toBe('https://storage.googleapis.com/upload/session-123');
      expect(result.videoUrl).toMatch(/^gs:\/\/test-bucket\/[0-9a-f-]+\.mov$/);
    });

    it('defaults content type to video/mp4 when none is given', async () => {
      const createResumableUploadMock = vi.fn().mockResolvedValue(['https://storage.googleapis.com/upload/session-456']);
      fileMock.mockReturnValue({
        createWriteStream: createWriteStreamMock,
        delete: deleteMock,
        createResumableUpload: createResumableUploadMock,
      });

      const uploader = createVideoBucketUploader(config);
      await uploader.createResumableUploadSession({ filename: 'clip.mp4', contentType: '' });

      expect(createResumableUploadMock).toHaveBeenCalledWith({ metadata: { contentType: 'video/mp4' } });
    });
  });
});
