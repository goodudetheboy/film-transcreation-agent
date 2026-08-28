import { randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Storage } from '@google-cloud/storage';

export interface VideoBucketUploader {
  /** Downloads an http(s) video and uploads it to the configured bucket, returning its gs:// URI. */
  uploadFromUrl(url: string): Promise<string>;
  /**
   * Uploads an already-in-memory file (a drag-and-dropped video, or a subtitle
   * file) to the configured bucket. `objectPrefix` (e.g. `'subtitles/'`) scopes
   * non-video uploads into their own "folder" of the same bucket, instead of
   * standing up a second bucket/IAM binding just for subtitles.
   */
  uploadBuffer(input: { buffer: Buffer; filename: string; contentType: string; objectPrefix?: string }): Promise<string>;
}

/** Blocks loopback, private, link-local (incl. the GCP/AWS metadata address), and unspecified ranges. */
function isBlockedIp(address: string, family: number): boolean {
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
    if (a === 0) return true; // unspecified
    return false;
  }
  const lower = address.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true; // unspecified
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (private)
  return false;
}

async function assertSafeHttpUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid video URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported video URL scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  if (isIP(hostname)) {
    if (isBlockedIp(hostname, isIP(hostname))) {
      throw new Error('video URL points to a disallowed address');
    }
    return parsed;
  }

  const resolved = await dnsLookup(hostname, { all: true });
  for (const { address, family } of resolved) {
    if (isBlockedIp(address, family)) {
      throw new Error('video URL points to a disallowed address');
    }
  }
  return parsed;
}

export function guessExtension(pathname: string): string {
  const match = /\.[a-zA-Z0-9]{2,5}$/.exec(pathname);
  return match ? match[0] : '.mp4';
}

export function createVideoBucketUploader(config: {
  bucketName: string;
  maxUploadBytes: number;
}): VideoBucketUploader {
  const storage = new Storage();
  const bucket = storage.bucket(config.bucketName);

  return {
    async uploadFromUrl(url: string): Promise<string> {
      const parsed = await assertSafeHttpUrl(url);

      const res = await fetch(parsed);
      if (!res.ok || !res.body) {
        throw new Error(`failed to download video (status ${res.status})`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      // Catches the common failure mode of pointing this at a web page (e.g. a YouTube
      // watch URL) rather than a direct video file — those return HTML, not a video.
      if (contentType && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
        throw new Error(
          `URL does not point to a direct video file (got content-type "${contentType}"). ` +
            'Streaming-site pages like YouTube are not supported — the URL must serve the video file directly.',
        );
      }

      const contentLength = Number(res.headers.get('content-length') ?? 0);
      if (contentLength > config.maxUploadBytes) {
        throw new Error(`video is too large (${contentLength} bytes, max ${config.maxUploadBytes})`);
      }

      const objectName = `${randomUUID()}${guessExtension(parsed.pathname)}`;
      const file = bucket.file(objectName);
      const writeStream = file.createWriteStream({
        resumable: false,
        contentType: res.headers.get('content-type') ?? 'video/mp4',
      });

      let bytesWritten = 0;
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesWritten += value.byteLength;
          if (bytesWritten > config.maxUploadBytes) {
            throw new Error(`video exceeded the ${config.maxUploadBytes}-byte upload limit`);
          }
          await new Promise<void>((resolve, reject) => {
            writeStream.write(value, (err) => (err ? reject(err) : resolve()));
          });
        }
        await new Promise<void>((resolve, reject) => {
          writeStream.end((err: unknown) => (err ? reject(err) : resolve()));
        });
      } catch (err) {
        writeStream.destroy();
        await file.delete({ ignoreNotFound: true });
        throw err;
      }

      return `gs://${config.bucketName}/${objectName}`;
    },

    async uploadBuffer({ buffer, filename, contentType, objectPrefix }): Promise<string> {
      if (buffer.byteLength > config.maxUploadBytes) {
        throw new Error(`video is too large (${buffer.byteLength} bytes, max ${config.maxUploadBytes})`);
      }

      const objectName = `${objectPrefix ?? ''}${randomUUID()}${guessExtension(filename)}`;
      const file = bucket.file(objectName);
      try {
        await file.save(buffer, { resumable: false, contentType: contentType || 'video/mp4' });
      } catch (err) {
        await file.delete({ ignoreNotFound: true });
        throw err;
      }

      return `gs://${config.bucketName}/${objectName}`;
    },
  };
}
