export type RunLikeStatus = 'queued' | 'running' | 'done' | 'error';

interface RunRefPart {
  run?: { jobId?: string; runId?: string };
}
interface RunRefTurn {
  parts: RunRefPart[];
}

/** Every jobId/runId a session's chat turns have ever logged via a `run` marker
 * part (see discoveryChatAgent.ts's/researchChatAgent.ts's buildRunsContext). */
export function collectRunRefs(turns: RunRefTurn[]): { jobIds: string[]; runIds: string[] } {
  const jobIds: string[] = [];
  const runIds: string[] = [];
  for (const t of turns) {
    for (const p of t.parts) {
      if (p.run?.jobId) jobIds.push(p.run.jobId);
      if (p.run?.runId) runIds.push(p.run.runId);
    }
  }
  return { jobIds, runIds };
}

/** A session's chat-stream status ('idle'|'streaming'|'error') only reflects
 * whether its text reply is in flight — it says nothing about a Discovery/Research
 * batch Run the session kicked off, which keeps processing in the background well
 * after the chat turn that started it goes idle. Combines both so "done" here
 * actually means the underlying work is done, aggregating over every run the
 * session ever kicked off (not just the latest) so one still-queued run among
 * several correctly keeps the row reading "running". */
export function combinedAgentStatus(
  chatStatus: 'idle' | 'streaming' | 'error',
  linkedRunStatuses: RunLikeStatus[],
): 'running' | 'done' | 'error' {
  if (chatStatus === 'streaming') return 'running';
  if (linkedRunStatuses.some((s) => s === 'queued' || s === 'running')) return 'running';
  if (chatStatus === 'error' || linkedRunStatuses.some((s) => s === 'error')) return 'error';
  return 'done';
}
