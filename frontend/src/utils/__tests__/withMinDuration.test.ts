import { describe, it, expect, vi } from 'vitest';
import { withMinDuration } from '../withMinDuration';

describe('withMinDuration', () => {
  it('resolves to the work value and calls the injected sleep with the given floor', async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await withMinDuration(Promise.resolve('video-url'), 3000, sleepImpl);

    expect(result).toBe('video-url');
    expect(sleepImpl).toHaveBeenCalledWith(3000);
  });

  it('does not wait any longer once work already outlasts the floor', async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    let resolveWork!: (value: string) => void;
    const work = new Promise<string>((resolve) => {
      resolveWork = resolve;
    });

    const pending = withMinDuration(work, 3000, sleepImpl);
    resolveWork('done-late');

    await expect(pending).resolves.toBe('done-late');
  });

  it('rejects immediately when work rejects, without waiting out the floor', async () => {
    const sleepImpl = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    const work = Promise.reject(new Error('boom'));

    await expect(withMinDuration(work, 3000, sleepImpl)).rejects.toThrow('boom');
  });
});
