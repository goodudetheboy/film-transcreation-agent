import { randomUUID } from 'node:crypto';
import { executeTool, type ChatStreamEvent, type ResearchChatAgent } from '../../../backend/src/services/researchChatAgent';
import type { ProjectItemStore } from '../../../backend/src/services/projectItemStore';
import type { ProjectRubricStore } from '../../../backend/src/services/projectRubricStore';
import type { ChatSessionStore } from '../../../backend/src/services/chatSessionStore';

/**
 * The ONLY thing allowed to be fake in this test layer — see CLAUDE.md. Scripts
 * one deterministic update_rubric_score tool call through the *real*
 * executeTool() (the same function the real agent uses), so the resulting
 * item_patched event and persisted ProjectItem write are real, not faked —
 * mirrors fakeResearchAgent.ts/fakeDiscoveryAgent.ts's "fake the top-level
 * agent boundary, not the store" convention.
 */
export function fakeResearchChatAgent(deps: {
  projectItemStore: ProjectItemStore;
  projectRubricStore: ProjectRubricStore;
  chatSessionStore: ChatSessionStore;
}): ResearchChatAgent {
  return {
    async *runTurn({ session, userText, itemId }): AsyncGenerator<ChatStreamEvent> {
      const now = () => new Date().toISOString();
      const contents = [...session.turns, { role: 'user' as const, parts: [{ text: userText }], ts: now() }];

      const rubrics = await deps.projectRubricStore.listRubrics(session.projectId);
      const rubric = rubrics[0];
      if (!itemId || !rubric) {
        yield { type: 'text_delta', text: '(fake chat agent) nothing to do — no open item or rubric.' };
        yield { type: 'turn_done' };
        return;
      }

      const callId = randomUUID();
      const args = { rubricId: rubric.id, score: 7, reasoning: 'fake agent: deterministic canned score for integration testing' };
      yield { type: 'tool_call', callId, name: 'update_rubric_score', args };

      const { response, itemPatch } = await executeTool(
        { name: 'update_rubric_score', args },
        { projectId: session.projectId, itemId },
        {
          projectItemStore: deps.projectItemStore,
          projectRubricStore: deps.projectRubricStore,
          fetchImpl: async () => {
            throw new Error('search_web not used by fakeResearchChatAgent');
          },
          parallelApiKey: undefined,
        },
      );
      yield { type: 'tool_result', callId, name: 'update_rubric_score', result: response };
      if (itemPatch) yield { type: 'item_patched', itemId: itemPatch.itemId, rubricId: itemPatch.rubricId, patch: itemPatch.patch };

      contents.push({ role: 'model', parts: [{ functionCall: { name: 'update_rubric_score', args } }], ts: now() });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: 'update_rubric_score', response } }], ts: now() });
      await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });

      yield { type: 'turn_done' };
    },
  };
}
