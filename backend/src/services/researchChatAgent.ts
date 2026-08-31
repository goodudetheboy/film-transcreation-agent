import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type { ProjectItemStore } from './projectItemStore.js';
import type { ProjectRubricStore } from './projectRubricStore.js';
import type { ChatSessionStore } from './chatSessionStore.js';
import type { ChatPart, ChatSession, ChatTurn } from './projectTypes.js';
import { computeImportanceScore } from './importanceScore.js';

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; result: Record<string, unknown> }
  | { type: 'item_patched'; itemId: string; rubricId?: string; patch: Record<string, unknown> }
  | { type: 'turn_done' }
  | { type: 'error'; message: string };

/** Narrow slice of the GoogleGenAI client this service actually calls — lets tests
 * inject a fake without touching ADC or the real Vertex AI SDK. Distinct from
 * researchAgent.ts's GenAIClient because this one streams. Confirmed against a real
 * Vertex AI generateContentStream + functionDeclarations call (see docs/adr/0025):
 * a streamed function call arrives as chunk.candidates[0].content.parts[i].functionCall. */
export interface ChatGenAIClient {
  models: {
    generateContentStream(params: unknown): Promise<
      AsyncIterable<{
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> };
          finishReason?: string;
        }>;
      }>
    >;
  };
}

export interface ResearchChatAgentConfig {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
  parallelApiKey?: string;
}

export interface ResearchChatAgentDeps {
  genAI?: ChatGenAIClient;
  /** Injectable for tests — defaults to the real global fetch. Used only by the
   * search_web tool's direct call to Parallel's REST API. */
  fetchImpl?: typeof fetch;
  projectItemStore: ProjectItemStore;
  projectRubricStore: ProjectRubricStore;
  chatSessionStore: ChatSessionStore;
}

export interface RunTurnInput {
  session: ChatSession;
  userText: string;
  /** Which ProjectItem's detail panel this message was sent from, if any — chat is
   * project-scoped (not per-detail-row, per the plan's confirmed architecture), but
   * a tool call still needs to know which item to mutate. Not part of the plan's
   * originally-sketched route body; added because the tool signatures it specifies
   * (update_rubric_score(rubricId, ...), no itemId param) only make sense with an
   * implicit "currently open item" carried alongside the message. See docs/adr/0025. */
  itemId?: string;
}

export interface ResearchChatAgent {
  runTurn(input: RunTurnInput): AsyncGenerator<ChatStreamEvent>;
}

// ---- v1 tool declarations -------------------------------------------------

const UPDATE_RUBRIC_SCORE_DECL = {
  name: 'update_rubric_score',
  description:
    "Update the score/reasoning/evidence/sources for one rubric on the currently open project item. This is the core live-edit tool — the change is applied immediately and visibly. Never use this to change an item's accepted/rejected/pending status; that stays a human-only decision.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      rubricId: { type: Type.STRING, description: 'The id of the rubric to update (from the CURRENT ITEM context).' },
      score: { type: Type.INTEGER, description: '0-10 integer: how strongly the item exhibits this rubric\'s concern.' },
      reasoning: { type: Type.STRING, description: '1-2 sentences: why this score.' },
      evidence: { type: Type.STRING, description: '1-2 sentences of supporting evidence.' },
      sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Source URLs, if any.' },
    },
    required: ['rubricId'],
  },
};

const PROPOSE_REPLACEMENT_DECL = {
  name: 'propose_replacement',
  description:
    'Propose a concrete replacement line or scene note for the currently open project item, and mark it as recommended for transcreation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The concrete replacement text.' },
      justification: { type: Type.STRING, description: '1-2 sentences: why this replacement addresses the concern.' },
    },
    required: ['text', 'justification'],
  },
};

const SEARCH_WEB_DECL = {
  name: 'search_web',
  description:
    "Search the web via Parallel to check how a specific reference, food, gesture, or joke actually reads in the target country. Use only when genuinely uncertain — don't spend a search on something you already know confidently.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      objective: { type: Type.STRING, description: 'What you are trying to find out.' },
      search_queries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '1-3 concrete search queries.' },
    },
    required: ['search_queries'],
  },
};

const CHAT_TOOLS = [{ functionDeclarations: [UPDATE_RUBRIC_SCORE_DECL, PROPOSE_REPLACEMENT_DECL, SEARCH_WEB_DECL] }];

const SYSTEM_INSTRUCTION = `You are the Research Agent's interactive assistant in a film localization
triage tool. You're chatting with a human localizer about one project. When a
specific item (script line + scene) is open, you can use your tools to
update that item's rubric scores live, propose a concrete replacement, or
search the web via Parallel for evidence you're missing. Keep replies
concise and conversational. Never call a tool to change an item's
accepted/rejected/pending/need-research status — that decision is always the
human's, made by clicking in the table, not something you do.`;

// ---- Tool execution ---------------------------------------------------

interface ExecuteToolDeps {
  projectItemStore: ProjectItemStore;
  projectRubricStore: ProjectRubricStore;
  fetchImpl: typeof fetch;
  parallelApiKey?: string;
}

interface ExecuteToolResult {
  response: Record<string, unknown>;
  itemPatch?: { itemId: string; rubricId?: string; patch: Record<string, unknown> };
}

const NO_ITEM_OPEN_ERROR = {
  error: 'no item is currently open in this chat — ask the user to open a specific detail row first',
};

/** Shared by both the real and mock chat agents so a testMode demo genuinely
 * exercises the same mutation path a real tool call would. */
export async function executeTool(
  call: { name: string; args: Record<string, unknown> },
  ctx: { projectId: string; itemId?: string },
  deps: ExecuteToolDeps,
): Promise<ExecuteToolResult> {
  if (call.name === 'update_rubric_score') {
    if (!ctx.itemId) return { response: NO_ITEM_OPEN_ERROR };
    const args = call.args as { rubricId: string; score?: number; reasoning?: string; evidence?: string; sources?: string[] };
    const [item, rubrics] = await Promise.all([
      deps.projectItemStore.getItem(ctx.projectId, ctx.itemId),
      deps.projectRubricStore.listRubrics(ctx.projectId),
    ]);
    if (!item) return { response: { error: 'item not found' } };

    const existing = item.scores.find((s) => s.rubricId === args.rubricId);
    const projectedScore = {
      rubricId: args.rubricId,
      score: args.score ?? existing?.score ?? 0,
      reasoning: args.reasoning ?? existing?.reasoning ?? '',
      evidence: args.evidence ?? existing?.evidence ?? '',
      sources: args.sources ?? existing?.sources ?? [],
    };
    const projectedScores = existing
      ? item.scores.map((s) => (s.rubricId === args.rubricId ? { ...s, ...projectedScore } : s))
      : [...item.scores, { ...projectedScore, updatedAt: new Date().toISOString(), updatedBy: 'chat-agent' as const }];
    const importanceScore = computeImportanceScore(projectedScores, rubrics);

    const updated = await deps.projectItemStore.patchScore(ctx.projectId, ctx.itemId, args.rubricId, {
      score: args.score,
      reasoning: args.reasoning,
      evidence: args.evidence,
      sources: args.sources,
      updatedBy: 'chat-agent',
      importanceScore,
    });
    if (!updated) return { response: { error: 'item not found' } };

    return {
      response: { ok: true, rubricId: args.rubricId, score: projectedScore.score, importanceScore },
      itemPatch: {
        itemId: ctx.itemId,
        rubricId: args.rubricId,
        patch: { score: projectedScore.score, reasoning: projectedScore.reasoning, evidence: projectedScore.evidence, sources: projectedScore.sources, importanceScore },
      },
    };
  }

  if (call.name === 'propose_replacement') {
    if (!ctx.itemId) return { response: NO_ITEM_OPEN_ERROR };
    const args = call.args as { text: string; justification: string };
    const updated = await deps.projectItemStore.setSuggestedReplacement(ctx.projectId, ctx.itemId, {
      text: args.text,
      justification: args.justification,
    });
    if (!updated) return { response: { error: 'item not found' } };
    return {
      response: { ok: true, suggestedReplacement: updated.suggestedReplacement },
      itemPatch: {
        itemId: ctx.itemId,
        patch: { suggestedReplacement: updated.suggestedReplacement, shouldTranscreate: true },
      },
    };
  }

  if (call.name === 'search_web') {
    const args = call.args as { objective?: string; search_queries: string[] };
    if (!deps.parallelApiKey) {
      return { response: { error: 'no Parallel API key is configured on this server' } };
    }
    if (!Array.isArray(args.search_queries) || args.search_queries.length === 0) {
      return { response: { error: 'search_queries is required' } };
    }
    try {
      // Direct call to Parallel's REST API — deliberately NOT the built-in Gemini
      // parallelAiSearch tool, which cannot be combined with functionDeclarations
      // on this app's Vertex AI + gemini-2.5-flash setup (confirmed HTTP 400, see
      // docs/adr/0025). Calling it ourselves also makes the search genuinely
      // visible/renderable in the chat UI, which the built-in tool's opaque
      // grounding never would have been.
      const res = await deps.fetchImpl('https://api.parallel.ai/v1/search', {
        method: 'POST',
        headers: { 'x-api-key': deps.parallelApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: args.objective, search_queries: args.search_queries }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { response: { error: `Parallel search failed (${res.status}): ${text || res.statusText}` } };
      }
      const data = (await res.json()) as { search_id?: string; results?: unknown[] };
      return { response: { search_id: data.search_id ?? null, results: data.results ?? [] } };
    } catch (err) {
      return { response: { error: err instanceof Error ? err.message : 'search_web request failed' } };
    }
  }

  return { response: { error: `unknown tool "${call.name}"` } };
}

// ---- Real agent ---------------------------------------------------------

function buildItemContext(item: Awaited<ReturnType<ProjectItemStore['getItem']>>): string {
  if (!item) return '';
  return `\n\nCURRENT ITEM (id: ${item.id}):\nSubtitle: ${item.subtitleText || '(no dialogue in this span)'}\nScene: ${item.sceneDescription}\nExisting scores: ${JSON.stringify(item.scores)}`;
}

// Safety guard against a runaway tool-calling loop — generous enough for a real
// multi-tool investigation (e.g. search, then update, then propose) but bounded.
const MAX_ROUNDS = 8;

export function createResearchChatAgent(config: ResearchChatAgentConfig, deps: ResearchChatAgentDeps): ResearchChatAgent {
  const ai: ChatGenAIClient =
    deps.genAI ?? new GoogleGenAI({ vertexai: true, project: config.googleCloudProject, location: config.geminiLocation });
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async *runTurn({ session, userText, itemId }) {
      const now = () => new Date().toISOString();
      const contents: ChatTurn[] = [...session.turns, { role: 'user', parts: [{ text: userText }], ts: now() }];

      try {
        const item = itemId ? await deps.projectItemStore.getItem(session.projectId, itemId) : undefined;
        const systemInstruction = SYSTEM_INSTRUCTION + buildItemContext(item);

        let done = false;
        let round = 0;
        while (!done && round < MAX_ROUNDS) {
          round++;
          const stream = await ai.models.generateContentStream({
            model: config.geminiModel,
            contents,
            config: { tools: CHAT_TOOLS, systemInstruction },
          });

          const modelParts: ChatPart[] = [];
          let sawFunctionCall = false;
          for await (const chunk of stream) {
            for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
              if (part.text) {
                modelParts.push({ text: part.text });
                yield { type: 'text_delta', text: part.text };
              }
              if (part.functionCall) {
                modelParts.push({ functionCall: { name: part.functionCall.name ?? '', args: part.functionCall.args ?? {} } });
                sawFunctionCall = true;
              }
            }
          }
          contents.push({ role: 'model', parts: modelParts, ts: now() });
          await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });

          if (!sawFunctionCall) {
            done = true;
            break;
          }

          for (const part of modelParts) {
            if (!part.functionCall) continue;
            const callId = randomUUID();
            const fc = part.functionCall;
            yield { type: 'tool_call', callId, name: fc.name, args: fc.args };

            const { response, itemPatch } = await executeTool(fc, { projectId: session.projectId, itemId }, {
              projectItemStore: deps.projectItemStore,
              projectRubricStore: deps.projectRubricStore,
              fetchImpl,
              parallelApiKey: config.parallelApiKey,
            });
            yield { type: 'tool_result', callId, name: fc.name, result: response };
            if (itemPatch) yield { type: 'item_patched', itemId: itemPatch.itemId, rubricId: itemPatch.rubricId, patch: itemPatch.patch };

            contents.push({ role: 'user', parts: [{ functionResponse: { name: fc.name, response } }], ts: now() });
            await deps.chatSessionStore.updateSession(session.projectId, session.id, { turns: contents });
          }
        }
        yield { type: 'turn_done' };
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : 'unknown error' };
      }
    },
  };
}
