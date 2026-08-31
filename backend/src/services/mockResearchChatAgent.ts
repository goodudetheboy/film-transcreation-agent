import { randomUUID } from 'node:crypto';
import type { ProjectItemStore } from './projectItemStore.js';
import type { ProjectRubricStore } from './projectRubricStore.js';
import type { ChatSessionStore } from './chatSessionStore.js';
import type { ChatPart, ChatTurn } from './projectTypes.js';
import { executeTool, type ResearchChatAgent } from './researchChatAgent.js';

export interface MockResearchChatAgentDeps {
  projectItemStore: ProjectItemStore;
  projectRubricStore: ProjectRubricStore;
  chatSessionStore: ChatSessionStore;
}

/**
 * Scripts one canned tool call (mirroring mockResearchAgent.ts's "broccoli"
 * easter egg) so testMode demos the live-edit behavior convincingly — it
 * genuinely calls the same executeTool() the real agent uses, so the
 * resulting item_patched event and persisted state are real, not faked.
 */
export function createMockResearchChatAgent(deps: MockResearchChatAgentDeps): ResearchChatAgent {
  return {
    async *runTurn({ session, userText, itemId }) {
      const now = () => new Date().toISOString();
      const contents: ChatTurn[] = [...session.turns, { role: 'user', parts: [{ text: userText }], ts: now() }];

      const item = itemId ? await deps.projectItemStore.getItem(session.projectId, itemId) : undefined;
      const rubrics = await deps.projectRubricStore.listRubrics(session.projectId);
      const rubric = rubrics[0];

      if (!item) {
        const text = 'Open a specific detail row first so I can demo a live edit on it (test mode — mock chat agent, no real Gemini call).';
        yield { type: 'text_delta', text };
        contents.push({ role: 'model', parts: [{ text }], ts: now() });
        await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });
        yield { type: 'turn_done' };
        return;
      }

      if (!rubric) {
        const text = 'This project has no rubrics yet to demo a live edit on — add one first (test mode — mock chat agent).';
        yield { type: 'text_delta', text };
        contents.push({ role: 'model', parts: [{ text }], ts: now() });
        await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });
        yield { type: 'turn_done' };
        return;
      }

      const introText = `(test mode — mock chat agent) Looking into "${item.subtitleText || item.sceneDescription}"...`;
      yield { type: 'text_delta', text: introText };
      const modelParts: ChatPart[] = [{ text: introText }];

      const callId = randomUUID();
      const args = {
        rubricId: rubric.id,
        score: 8,
        reasoning: `Mock chat agent: "${rubric.name}" reads as a strong match here — canned demo data, no real Gemini call was made.`,
        evidence: '(mock data — no web search performed)',
      };
      modelParts.push({ functionCall: { name: 'update_rubric_score', args } });
      yield { type: 'tool_call', callId, name: 'update_rubric_score', args };

      const { response, itemPatch } = await executeTool(
        { name: 'update_rubric_score', args },
        { projectId: session.projectId, itemId: item.id },
        {
          projectItemStore: deps.projectItemStore,
          projectRubricStore: deps.projectRubricStore,
          fetchImpl: async () => {
            throw new Error('search_web is not used by the mock chat agent');
          },
          parallelApiKey: undefined,
        },
      );
      yield { type: 'tool_result', callId, name: 'update_rubric_score', result: response };
      if (itemPatch) yield { type: 'item_patched', itemId: itemPatch.itemId, rubricId: itemPatch.rubricId, patch: itemPatch.patch };

      contents.push({ role: 'model', parts: modelParts, ts: now() });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: 'update_rubric_score', response } }], ts: now() });

      const followUpText = `I updated the "${rubric.name}" score to 8/10 based on that. Ask me to search the web via Parallel for more evidence, or to propose a replacement line.`;
      yield { type: 'text_delta', text: followUpText };
      contents.push({ role: 'model', parts: [{ text: followUpText }], ts: now() });

      await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });
      yield { type: 'turn_done' };
    },
  };
}
