import { vi } from 'vitest';
import type { CaptioningClient, GestureLog } from '../../../backend/src/services/captioningClient';

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002 and CLAUDE.md. */
export function fakeCaptioningClient(result: GestureLog[] = []): CaptioningClient {
  return { preprocessVideo: vi.fn().mockResolvedValue(result) };
}
