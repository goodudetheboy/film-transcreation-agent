import { vi } from 'vitest';
import type { DialogflowClient, FlaggedLine } from '../../../proxy/src/services/dialogflowClient';

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002 and CLAUDE.md. */
export function fakeDialogflowClient(result: FlaggedLine[] = []): DialogflowClient {
  return { analyzeScript: vi.fn().mockResolvedValue(result) };
}
