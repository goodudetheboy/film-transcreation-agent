/**
 * Ensures `work` stays "in flight" for at least `minMs`, without making a
 * slow `work` wait any longer than it already takes: the floor timer and
 * `work` run concurrently, and this resolves once both are done. Rejects
 * immediately if `work` rejects — a failed upload should surface its error
 * right away, not sit through a fake animation delay first. Mirrors the
 * `sleepImpl`-injection convention in `resumableUpload.ts` so tests never
 * need real timers.
 */
export async function withMinDuration<T>(
  work: Promise<T>,
  minMs: number,
  sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  const [result] = await Promise.all([work, sleepImpl(minMs)]);
  return result;
}
