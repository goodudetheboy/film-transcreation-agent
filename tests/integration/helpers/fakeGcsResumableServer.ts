import http from 'node:http';

export interface FakeGcsResumableServer {
  url: string;
  receivedBytes: () => number;
  close: () => Promise<void>;
}

/**
 * A minimal stand-in for GCS's resumable-upload session endpoint — just enough
 * of the protocol (308-until-complete, status-check via a wildcard
 * `Content-Range` total) for `frontend/src/api/resumableUpload.ts` to talk to
 * over a real fetch/TCP hop. This is what `videoBucketUploader.createResumableUploadSession`
 * gets faked to point at — the ONLY thing allowed to be fake in this test layer
 * is the external Google client, never the frontend<->backend hop (see CLAUDE.md).
 */
export async function startFakeGcsResumableServer(): Promise<FakeGcsResumableServer> {
  let received = 0;

  const server = http.createServer((req, res) => {
    const contentRange = req.headers['content-range'] as string | undefined;
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const statusCheck = /^bytes \*\/(\d+)$/.exec(contentRange ?? '');
      if (statusCheck) {
        const total = Number(statusCheck[1]);
        if (received >= total) {
          res.writeHead(200).end();
        } else if (received === 0) {
          res.writeHead(308).end();
        } else {
          res.writeHead(308, { Range: `bytes=0-${received - 1}` }).end();
        }
        return;
      }

      const dataChunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? '');
      if (!dataChunk) {
        res.writeHead(400).end();
        return;
      }
      const [, , endStr, totalStr] = dataChunk;
      received += Buffer.concat(chunks).length;
      const total = Number(totalStr);
      const end = Number(endStr);
      if (end + 1 >= total) {
        res.writeHead(200).end();
      } else {
        res.writeHead(308, { Range: `bytes=0-${received - 1}` }).end();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to bind fake GCS server to an ephemeral port');
  }

  return {
    url: `http://127.0.0.1:${address.port}/upload/fake-session`,
    receivedBytes: () => received,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
