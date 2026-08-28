// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { verifyPasscode } from '../apiClient';

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | null, textBody = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    text: vi.fn().mockResolvedValue(textBody),
  } as unknown as Response);
}

describe('verifyPasscode', () => {
  it('resolves ok:true when the backend returns 200', async () => {
    const fetchImpl = fakeFetch(200, null);
    const result = await verifyPasscode('correct', { fetchImpl, baseUrl: 'http://x' });
    expect(result).toEqual({ ok: true });
  });

  it('POSTs the passcode as JSON to /api/verify-passcode', async () => {
    const fetchImpl = fakeFetch(200, null);
    await verifyPasscode('correct', { fetchImpl, baseUrl: 'http://x' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/verify-passcode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ passcode: 'correct' }),
      }),
    );
  });

  it('resolves ok:false with the backend detail when the passcode is wrong', async () => {
    const fetchImpl = fakeFetch(401, null, JSON.stringify({ error: 'invalid passcode' }));
    const result = await verifyPasscode('wrong', { fetchImpl, baseUrl: 'http://x' });
    expect(result).toEqual({ ok: false, message: 'invalid passcode' });
  });
});
