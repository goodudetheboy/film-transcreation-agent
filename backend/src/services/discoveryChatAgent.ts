import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type { ChatGenAIClient } from './researchChatAgent.js';
import type { DetailRow, DiscoveryAgentSession, DiscoveryChatPart, DiscoveryChatTurn } from './filmTypes.js';
import type { DetailRowsStore } from './detailRowsStore.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { DiscoveryChatSessionStore } from './discoveryChatSessionStore.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';
import { mergeDiscoveryResult, discardDiscoveryResult } from './discoveryResultActions.js';

export type { ChatGenAIClient } from './researchChatAgent.js';

export type DiscoveryChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; result: Record<string, unknown> }
  | { type: 'row_patched'; row: DetailRow }
  | { type: 'row_added'; row: DetailRow; jobId: string; tempId: string }
  | { type: 'row_discarded'; jobId: string; tempId: string }
  | { type: 'turn_done' }
  | { type: 'error'; message: string };

export interface DiscoveryChatAgentConfig {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
}

export interface DiscoveryChatAgentDeps {
  genAI?: ChatGenAIClient;
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  discoveryChatSessionStore: DiscoveryChatSessionStore;
  eventBus: DiscoveryEventBus;
}

export interface RunTurnInput {
  session: DiscoveryAgentSession;
  userText: string;
}

export interface DiscoveryChatAgent {
  runTurn(input: RunTurnInput): AsyncGenerator<DiscoveryChatStreamEvent>;
}

// ---- Tool declarations -----------------------------------------------------

const EDIT_DETAIL_ROW_DECL = {
  name: 'edit_detail_row',
  description:
    "Edit one field on an existing Detail row for this film — any row, not just ones this agent found. Applies immediately and visibly, same as a human typing in the table. Never ask for confirmation first, just do it and say what you changed.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      rowId: { type: Type.STRING, description: 'The id of the Detail row to edit (from the FILM DETAILS context).' },
      field: { type: Type.STRING, description: 'Which field to change: subtitleText, segmentDescription, gesture, or notes.' },
      value: { type: Type.STRING, description: 'The new value for that field.' },
    },
    required: ['rowId', 'field', 'value'],
  },
};

const MERGE_CANDIDATE_ROW_DECL = {
  name: 'merge_candidate_row',
  description:
    "Accept one of this agent's pending candidate rows into the film's Details table, same as clicking its Add button on the run card.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      jobId: { type: Type.STRING, description: 'The run (discovery job) the candidate belongs to — from THIS AGENT\'S RUNS context.' },
      tempId: { type: Type.STRING, description: "The candidate row's tempId." },
    },
    required: ['jobId', 'tempId'],
  },
};

const DISCARD_CANDIDATE_ROW_DECL = {
  name: 'discard_candidate_row',
  description:
    "Discard one of this agent's pending candidate rows, same as clicking its Delete button on the run card. Does not touch the Details table.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      jobId: { type: Type.STRING, description: 'The run (discovery job) the candidate belongs to — from THIS AGENT\'S RUNS context.' },
      tempId: { type: Type.STRING, description: "The candidate row's tempId." },
    },
    required: ['jobId', 'tempId'],
  },
};

const CHAT_TOOLS = [{ functionDeclarations: [EDIT_DETAIL_ROW_DECL, MERGE_CANDIDATE_ROW_DECL, DISCARD_CANDIDATE_ROW_DECL] }];

const SYSTEM_INSTRUCTION = `You are a Discovery Agent's interactive assistant in a film localization
triage tool. You're chatting with a human localizer inside one Agent's thread,
scoped to one film. Answer questions about this agent's runs (passes) and
their candidate rows. You can also use your tools to edit any existing Detail
row's content, or accept/discard one of THIS agent's pending candidate rows.
Kicking off a brand-new pass is a button the human clicks, never something you
decide to do yourself — if asked to find more lines, tell them to use the
"Kick off another pass" button. Keep replies concise and conversational.`;

const EDITABLE_FIELDS = ['subtitleText', 'segmentDescription', 'gesture', 'notes'] as const;

// ---- Tool execution ---------------------------------------------------

interface ExecuteToolDeps {
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  eventBus: DiscoveryEventBus;
}

interface ExecuteToolResult {
  response: Record<string, unknown>;
  rowEvent?: Extract<DiscoveryChatStreamEvent, { type: 'row_patched' | 'row_added' | 'row_discarded' }>;
}

/** Shared by both the real and mock chat agents so a testMode demo genuinely
 * exercises the same mutation path a real tool call would. */
export async function executeTool(
  call: { name: string; args: Record<string, unknown> },
  ctx: { filmId: string },
  deps: ExecuteToolDeps,
): Promise<ExecuteToolResult> {
  if (call.name === 'edit_detail_row') {
    const args = call.args as { rowId: string; field: string; value: string };
    if (!EDITABLE_FIELDS.includes(args.field as (typeof EDITABLE_FIELDS)[number])) {
      return { response: { error: `field must be one of ${EDITABLE_FIELDS.join(', ')}` } };
    }
    const patch = args.field === 'subtitleText' ? { subtitleText: args.value } : { values: { [args.field]: args.value } };
    const updated = await deps.detailRowsStore.updateRow(ctx.filmId, args.rowId, patch as Parameters<DetailRowsStore['updateRow']>[2]);
    if (!updated) return { response: { error: 'row not found' } };
    return { response: { ok: true, rowId: updated.id, field: args.field, value: args.value }, rowEvent: { type: 'row_patched', row: updated } };
  }

  if (call.name === 'merge_candidate_row') {
    const args = call.args as { jobId: string; tempId: string };
    const result = await mergeDiscoveryResult(
      { discoveryJobStore: deps.discoveryJobStore, detailRowsStore: deps.detailRowsStore, eventBus: deps.eventBus },
      ctx.filmId,
      args.jobId,
      args.tempId,
    );
    if (!result.ok) return { response: { error: result.error } };
    return { response: { ok: true, row: result.value }, rowEvent: { type: 'row_added', row: result.value, jobId: args.jobId, tempId: args.tempId } };
  }

  if (call.name === 'discard_candidate_row') {
    const args = call.args as { jobId: string; tempId: string };
    const result = await discardDiscoveryResult(
      { discoveryJobStore: deps.discoveryJobStore, detailRowsStore: deps.detailRowsStore, eventBus: deps.eventBus },
      ctx.filmId,
      args.jobId,
      args.tempId,
    );
    if (!result.ok) return { response: { error: result.error } };
    return { response: { ok: true }, rowEvent: { type: 'row_discarded', jobId: args.jobId, tempId: args.tempId } };
  }

  return { response: { error: `unknown tool "${call.name}"` } };
}

// ---- Real agent ---------------------------------------------------------

async function buildDetailsContext(detailRowsStore: DetailRowsStore, filmId: string): Promise<string> {
  const rows = await detailRowsStore.listRows(filmId);
  if (rows.length === 0) return '';
  const lines = rows.map(
    (r) =>
      `rowId: ${r.id} | subtitleText: "${r.subtitleText}" | segmentDescription: "${r.values.segmentDescription}" | gesture: "${r.values.gesture}" | notes: "${r.values.notes}"`,
  );
  return `\n\nFILM DETAILS (existing rows you can edit with edit_detail_row):\n${lines.join('\n')}`;
}

async function buildRunsContext(discoveryJobStore: DiscoveryJobStore, filmId: string, agentNumber: number): Promise<string> {
  const jobs = (await discoveryJobStore.listJobs(filmId)).filter((j) => j.agentNumber === agentNumber);
  if (jobs.length === 0) return '';
  const lines = jobs.map((j) => {
    const candidates = j.resultRows
      .map((r) => `    tempId: ${r.tempId} | "${r.subtitleText}" | ${JSON.stringify(r.values)}`)
      .join('\n');
    return `Run #${j.passNumber} (jobId: ${j.id}, status: ${j.status})${j.specialInstruction ? `, instruction: "${j.specialInstruction}"` : ''}:\n${candidates || '    (no pending candidates)'}`;
  });
  return `\n\nTHIS AGENT'S RUNS:\n${lines.join('\n')}`;
}

// Safety guard against a runaway tool-calling loop, same bound as researchChatAgent.ts.
const MAX_ROUNDS = 8;

export function createDiscoveryChatAgent(config: DiscoveryChatAgentConfig, deps: DiscoveryChatAgentDeps): DiscoveryChatAgent {
  const ai: ChatGenAIClient =
    deps.genAI ?? new GoogleGenAI({ vertexai: true, project: config.googleCloudProject, location: config.geminiLocation });

  return {
    async *runTurn({ session, userText }) {
      const now = () => new Date().toISOString();
      // Persisted history keeps `run` marker turns (role: 'system') so the
      // frontend timeline sees them — but those never go to Gemini as
      // `contents`; the model gets the same info via THIS AGENT'S RUNS below.
      const persistedTurns: DiscoveryChatTurn[] = [...session.turns, { role: 'user', parts: [{ text: userText }], ts: now() }];

      try {
        const [detailsContext, runsContext] = await Promise.all([
          buildDetailsContext(deps.detailRowsStore, session.filmId),
          buildRunsContext(deps.discoveryJobStore, session.filmId, session.agentNumber),
        ]);
        const systemInstruction = SYSTEM_INSTRUCTION + detailsContext + runsContext;

        let done = false;
        let round = 0;
        while (!done && round < MAX_ROUNDS) {
          round++;
          const apiContents = persistedTurns.filter((t) => t.role !== 'system');
          const stream = await ai.models.generateContentStream({
            model: config.geminiModel,
            contents: apiContents,
            config: { tools: CHAT_TOOLS, systemInstruction },
          });

          const modelParts: DiscoveryChatPart[] = [];
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
          persistedTurns.push({ role: 'model', parts: modelParts, ts: now() });
          await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });

          if (!sawFunctionCall) {
            done = true;
            break;
          }

          for (const part of modelParts) {
            if (!part.functionCall) continue;
            const callId = randomUUID();
            const fc = part.functionCall;
            yield { type: 'tool_call', callId, name: fc.name, args: fc.args };

            const { response, rowEvent } = await executeTool(fc, { filmId: session.filmId }, {
              detailRowsStore: deps.detailRowsStore,
              discoveryJobStore: deps.discoveryJobStore,
              eventBus: deps.eventBus,
            });
            yield { type: 'tool_result', callId, name: fc.name, result: response };
            if (rowEvent) yield rowEvent;

            persistedTurns.push({ role: 'user', parts: [{ functionResponse: { name: fc.name, response } }], ts: now() });
            await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });
          }
        }
        yield { type: 'turn_done' };
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : 'unknown error' };
      }
    },
  };
}
