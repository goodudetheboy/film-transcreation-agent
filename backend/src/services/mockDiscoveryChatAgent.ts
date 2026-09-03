import { randomUUID } from 'node:crypto';
import type { DetailRowsStore } from './detailRowsStore.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { DiscoveryChatSessionStore } from './discoveryChatSessionStore.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';
import type { DiscoveryChatPart, DiscoveryChatTurn } from './filmTypes.js';
import { executeTool, type DiscoveryChatAgent } from './discoveryChatAgent.js';

export interface MockDiscoveryChatAgentDeps {
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  discoveryChatSessionStore: DiscoveryChatSessionStore;
  eventBus: DiscoveryEventBus;
}

/**
 * Scripts one canned tool call (mirroring mockResearchChatAgent.ts) so
 * testMode demos the live-edit behavior convincingly — it genuinely calls
 * the same executeTool() the real agent uses. Prefers merging the first
 * pending candidate row from this agent's most recent run (if any); falls
 * back to editing the first Detail row's notes.
 */
export function createMockDiscoveryChatAgent(deps: MockDiscoveryChatAgentDeps): DiscoveryChatAgent {
  return {
    async *runTurn({ session, userText }) {
      const now = () => new Date().toISOString();
      const persistedTurns: DiscoveryChatTurn[] = [...session.turns, { role: 'user', parts: [{ text: userText }], ts: now() }];

      const jobs = (await deps.discoveryJobStore.listJobs(session.filmId)).filter((j) => j.agentNumber === session.agentNumber);
      const jobWithCandidate = [...jobs].reverse().find((j) => j.resultRows.length > 0);

      if (jobWithCandidate) {
        const candidate = jobWithCandidate.resultRows[0];
        const introText = `(test mode — mock chat agent) Looking at "${candidate.subtitleText}" from Run #${jobWithCandidate.passNumber}...`;
        yield { type: 'text_delta', text: introText };
        const modelParts: DiscoveryChatPart[] = [{ text: introText }];

        const callId = randomUUID();
        const args = { jobId: jobWithCandidate.id, tempId: candidate.tempId };
        modelParts.push({ functionCall: { name: 'merge_candidate_row', args } });
        yield { type: 'tool_call', callId, name: 'merge_candidate_row', args };

        const { response, rowEvent } = await executeTool({ name: 'merge_candidate_row', args }, { filmId: session.filmId }, {
          detailRowsStore: deps.detailRowsStore,
          discoveryJobStore: deps.discoveryJobStore,
          eventBus: deps.eventBus,
        });
        yield { type: 'tool_result', callId, name: 'merge_candidate_row', result: response };
        if (rowEvent) yield rowEvent;

        persistedTurns.push({ role: 'model', parts: modelParts, ts: now() });
        persistedTurns.push({ role: 'user', parts: [{ functionResponse: { name: 'merge_candidate_row', response } }], ts: now() });

        const followUpText = 'I added that candidate to the Details table. Ask me to discard a candidate, edit an existing row, or kick off another pass.';
        yield { type: 'text_delta', text: followUpText };
        persistedTurns.push({ role: 'model', parts: [{ text: followUpText }], ts: now() });

        await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });
        yield { type: 'turn_done' };
        return;
      }

      const rows = await deps.detailRowsStore.listRows(session.filmId);
      const row = rows[0];

      if (!row) {
        const text = 'This film has no Detail rows yet to demo an edit on, and this agent has no pending candidates either (test mode — mock chat agent).';
        yield { type: 'text_delta', text };
        persistedTurns.push({ role: 'model', parts: [{ text }], ts: now() });
        await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });
        yield { type: 'turn_done' };
        return;
      }

      const introText = `(test mode — mock chat agent) Looking at "${row.subtitleText}"...`;
      yield { type: 'text_delta', text: introText };
      const modelParts: DiscoveryChatPart[] = [{ text: introText }];

      const callId = randomUUID();
      const args = { rowId: row.id, field: 'notes', value: 'Mock chat agent: flagged for a closer look — canned demo data, no real Gemini call was made.' };
      modelParts.push({ functionCall: { name: 'edit_detail_row', args } });
      yield { type: 'tool_call', callId, name: 'edit_detail_row', args };

      const { response, rowEvent } = await executeTool({ name: 'edit_detail_row', args }, { filmId: session.filmId }, {
        detailRowsStore: deps.detailRowsStore,
        discoveryJobStore: deps.discoveryJobStore,
        eventBus: deps.eventBus,
      });
      yield { type: 'tool_result', callId, name: 'edit_detail_row', result: response };
      if (rowEvent) yield rowEvent;

      persistedTurns.push({ role: 'model', parts: modelParts, ts: now() });
      persistedTurns.push({ role: 'user', parts: [{ functionResponse: { name: 'edit_detail_row', response } }], ts: now() });

      const followUpText = 'I added a note on that row. Ask me to kick off another pass, or edit a different row.';
      yield { type: 'text_delta', text: followUpText };
      persistedTurns.push({ role: 'model', parts: [{ text: followUpText }], ts: now() });

      await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });
      yield { type: 'turn_done' };
    },
  };
}
