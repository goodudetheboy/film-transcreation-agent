import http from 'node:http';
import { createApp, type AppDeps } from '../../../proxy/src/app';

export interface TestProxy {
  url: string;
  close: () => Promise<void>;
}

/** Starts a REAL proxy server on an OS-assigned port — nothing here is mocked. */
export async function startTestProxy(deps: AppDeps): Promise<TestProxy> {
  const app = createApp(deps);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to bind test proxy to an ephemeral port');
  }
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
