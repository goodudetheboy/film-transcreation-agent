import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type { ChatGenAIClient } from './researchChatAgent.js';
import type { DetailRow, DiscoveryAgentSession, DiscoveryChatPart, DiscoveryChatTurn } from './filmTypes.js';
import type { DetailRowsStore } from './detailRowsStore.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { DiscoveryChatSessionStore } from './discoveryChatSessionStore.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';
import type { FilmStore } from './filmStore.js';
import { mergeDiscoveryResult, discardDiscoveryResult } from './discoveryResultActions.js';
import { subtitleTextForRange } from './subtitleOverlap.js';
import { MAX_CLIP_MS, type VideoSegmentDescriber } from './videoSegmentDescriber.js';

export type { ChatGenAIClient } from './researchChatAgent.js';

export type DiscoveryChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; result: Record<string, unknown> }
  | { type: 'row_patched'; row: DetailRow }
  | { type: 'row_added'; row: DetailRow; jobId: string; tempId: string }
  | { type: 'row_discarded'; jobId: string; tempId: string }
  | { type: 'row_created'; row: DetailRow }
  | { type: 'row_deleted'; rowId: string }
  | { type: 'turn_done' }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

export interface DiscoveryChatAgentConfig {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
}

export interface DiscoveryChatAgentDeps {
  genAI?: ChatGenAIClient;
  filmStore: FilmStore;
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  discoveryChatSessionStore: DiscoveryChatSessionStore;
  eventBus: DiscoveryEventBus;
  videoSegmentDescriber: VideoSegmentDescriber;
}

export interface RunTurnInput {
  session: DiscoveryAgentSession;
  userText: string;
  /** Aborted when the client disconnects (e.g. the user hits Stop) — wired through
   * to generateContentStream's own abortSignal so a stop actually halts the
   * in-flight Gemini call/tool loop server-side, same as researchChatAgent.ts. */
  signal?: AbortSignal;
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
      rowId: {
        type: Type.STRING,
        description: 'The id of the Detail row to edit (from the FILM DETAILS context) — match it by rowId, or by the timestamp range shown next to it if the user refers to a row by time.',
      },
      field: {
        type: Type.STRING,
        description:
          'Which field to change: subtitleText, segmentDescription, gesture, notes, or the key of any custom column listed in the CUSTOM COLUMNS context (e.g. "food").',
      },
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

const ADD_DETAIL_ROW_DECL = {
  name: 'add_detail_row',
  description:
    "Add a brand-new row to this film's Details table for a time range, same as clicking the + button and typing a range in by hand. Its subtitle text is derived automatically from the film's subtitle for that range. Applies immediately and visibly. Never ask for confirmation first, just do it and say what you added.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startMs: { type: Type.NUMBER, description: 'Start of the range in milliseconds, >= 0.' },
      endMs: { type: Type.NUMBER, description: 'End of the range in milliseconds, must be greater than startMs.' },
      segmentDescription: { type: Type.STRING, description: 'Optional initial value for the segmentDescription field.' },
      gesture: { type: Type.STRING, description: 'Optional initial value for the gesture field.' },
      notes: { type: Type.STRING, description: 'Optional initial value for the notes field.' },
    },
    required: ['startMs', 'endMs'],
  },
};

const DELETE_DETAIL_ROW_DECL = {
  name: 'delete_detail_row',
  description:
    "Permanently delete an existing row from this film's Details table — any row, not just ones this agent found. This cannot be undone. Never ask for confirmation first, just do it and say what you removed.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      rowId: {
        type: Type.STRING,
        description: 'The id of the Detail row to delete (from the FILM DETAILS context) — match it by rowId, or by the timestamp range shown next to it if the user refers to a row by time.',
      },
    },
    required: ['rowId'],
  },
};

const DESCRIBE_VIDEO_SEGMENT_DECL = {
  name: 'describe_video_segment',
  description:
    "Look at a short slice of this film's actual footage and get back a text description of what's visibly happening — actions, objects, on-screen text, gestures, expressions. Use this only when you need to know what's shown on screen and the subtitle text or existing row data doesn't already tell you; don't call it reflexively for every question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startMs: { type: Type.NUMBER, description: 'Clip start time in milliseconds.' },
      endMs: {
        type: Type.NUMBER,
        description: `Clip end time in milliseconds. Must be after startMs and at most ${MAX_CLIP_MS}ms after it — request a shorter range and call again if you need to look at more.`,
      },
      focus: { type: Type.STRING, description: 'Optional: what to pay particular attention to, e.g. "what food is on the table".' },
    },
    required: ['startMs', 'endMs'],
  },
};

const CHAT_TOOLS = [
  {
    functionDeclarations: [
      EDIT_DETAIL_ROW_DECL,
      ADD_DETAIL_ROW_DECL,
      DELETE_DETAIL_ROW_DECL,
      MERGE_CANDIDATE_ROW_DECL,
      DISCARD_CANDIDATE_ROW_DECL,
      DESCRIBE_VIDEO_SEGMENT_DECL,
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are a Discovery Agent's interactive assistant in a film localization
triage tool. You're chatting with a human localizer inside one Agent's thread,
scoped to one film. Answer questions about this agent's runs (passes) and
their candidate rows. You can also use your tools to add a new Detail row,
edit or delete any existing Detail row, accept/discard one of THIS agent's
pending candidate rows, or look at a short slice of the actual video footage
when you need to know what's visibly happening on screen. Kicking off a brand-new pass is a button the human
clicks, never something you decide to do yourself — if asked to find more
lines, tell them to use the "Kick off another pass" button. Keep replies
concise and conversational.`;

const EDITABLE_FIELDS = ['subtitleText', 'segmentDescription', 'gesture', 'notes'] as const;

// ---- Tool execution ---------------------------------------------------

interface ExecuteToolDeps {
  filmStore: FilmStore;
  detailRowsStore: DetailRowsStore;
  discoveryJobStore: DiscoveryJobStore;
  eventBus: DiscoveryEventBus;
  videoSegmentDescriber: VideoSegmentDescriber;
}

interface ExecuteToolResult {
  response: Record<string, unknown>;
  rowEvent?: Extract<DiscoveryChatStreamEvent, { type: 'row_patched' | 'row_added' | 'row_discarded' | 'row_created' | 'row_deleted' }>;
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
    const isFixedField = EDITABLE_FIELDS.includes(args.field as (typeof EDITABLE_FIELDS)[number]);
    let isCustomField = false;
    if (!isFixedField) {
      const columns = await deps.detailRowsStore.listColumns(ctx.filmId);
      isCustomField = columns.some((c) => c.key === args.field);
      if (!isCustomField) {
        return { response: { error: `field must be one of ${EDITABLE_FIELDS.join(', ')}, or an existing custom column key` } };
      }
    }
    const patch = isCustomField
      ? { values: { custom: { [args.field]: args.value } } }
      : args.field === 'subtitleText'
        ? { subtitleText: args.value }
        : { values: { [args.field]: args.value } };
    const updated = await deps.detailRowsStore.updateRow(ctx.filmId, args.rowId, patch as Parameters<DetailRowsStore['updateRow']>[2]);
    if (!updated) return { response: { error: 'row not found' } };
    return { response: { ok: true, rowId: updated.id, field: args.field, value: args.value }, rowEvent: { type: 'row_patched', row: updated } };
  }

  if (call.name === 'add_detail_row') {
    const args = call.args as { startMs: number; endMs: number; segmentDescription?: string; gesture?: string; notes?: string };
    if (typeof args.startMs !== 'number' || typeof args.endMs !== 'number' || args.startMs < 0 || args.endMs <= args.startMs) {
      return { response: { error: 'startMs/endMs must be numbers with endMs > startMs >= 0' } };
    }
    const film = await deps.filmStore.getFilm(ctx.filmId);
    const row = await deps.detailRowsStore.addRow(ctx.filmId, {
      startMs: args.startMs,
      endMs: args.endMs,
      subtitleText: subtitleTextForRange(film?.subtitle?.entries ?? [], args.startMs, args.endMs),
      values: { segmentDescription: args.segmentDescription, gesture: args.gesture, notes: args.notes },
      provenance: { type: 'user-marked' },
    });
    return { response: { ok: true, row }, rowEvent: { type: 'row_created', row } };
  }

  if (call.name === 'delete_detail_row') {
    const args = call.args as { rowId: string };
    const deleted = await deps.detailRowsStore.deleteRow(ctx.filmId, args.rowId);
    if (!deleted) return { response: { error: 'row not found' } };
    return { response: { ok: true }, rowEvent: { type: 'row_deleted', rowId: args.rowId } };
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

  if (call.name === 'describe_video_segment') {
    const args = call.args as { startMs: number; endMs: number; focus?: string };
    if (typeof args.startMs !== 'number' || typeof args.endMs !== 'number' || !(args.endMs > args.startMs)) {
      return { response: { error: 'startMs/endMs must be numbers with endMs > startMs' } };
    }
    if (args.endMs - args.startMs > MAX_CLIP_MS) {
      return { response: { error: `clip too long — max ${MAX_CLIP_MS}ms per call, request a shorter range` } };
    }
    const film = await deps.filmStore.getFilm(ctx.filmId);
    if (!film) return { response: { error: 'film not found' } };
    const description = await deps.videoSegmentDescriber.describeVideoSegment({
      videoUrl: film.videoUrl,
      startMs: args.startMs,
      endMs: args.endMs,
      focus: args.focus,
    });
    return { response: { description } };
  }

  return { response: { error: `unknown tool "${call.name}"` } };
}

// ---- Real agent ---------------------------------------------------------

function formatClock(ms: number): string {
  return new Date(ms).toISOString().substring(14, 19); // "mm:ss"
}

async function buildDetailsContext(detailRowsStore: DetailRowsStore, filmId: string): Promise<string> {
  const [rows, columns] = await Promise.all([detailRowsStore.listRows(filmId), detailRowsStore.listColumns(filmId)]);
  if (rows.length === 0) return '';
  const lines = rows.map((r) => {
    const customPairs = columns.map((c) => `${c.key}: "${r.values.custom[c.key] ?? ''}"`).join(' | ');
    return `rowId: ${r.id} | ${formatClock(r.startMs)}-${formatClock(r.endMs)} | subtitleText: "${r.subtitleText}" | segmentDescription: "${r.values.segmentDescription}" | gesture: "${r.values.gesture}" | notes: "${r.values.notes}"${customPairs ? ` | ${customPairs}` : ''}`;
  });
  const columnsBlock =
    columns.length > 0
      ? `\n\nCUSTOM COLUMNS (editable via edit_detail_row's field, using the key shown):\n${columns.map((c) => `key: ${c.key} | name: "${c.name}" | description: "${c.description}"`).join('\n')}`
      : '';
  return `\n\nFILM DETAILS (existing rows you can edit with edit_detail_row — match by rowId, or by the mm:ss timestamp range if the user refers to a row by time):\n${lines.join('\n')}${columnsBlock}`;
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
    async *runTurn({ session, userText, signal }) {
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
        let stopped = false;
        let round = 0;
        while (!done && round < MAX_ROUNDS) {
          if (signal?.aborted) {
            stopped = true;
            break;
          }
          round++;
          const apiContents = persistedTurns.filter((t) => t.role !== 'system');
          const stream = await ai.models.generateContentStream({
            model: config.geminiModel,
            contents: apiContents,
            config: { tools: CHAT_TOOLS, systemInstruction, abortSignal: signal },
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

          // Gemini requires exactly one functionResponse part per functionCall part
          // from the preceding model turn, all bundled into a single turn — so every
          // call in this round must get a response before we persist, even if the
          // client disconnects partway through. Checking `signal.aborted` here would
          // leave later calls unanswered and permanently corrupt this session's
          // history (every future turn would resend the mismatched counts and 400).
          const responseParts: DiscoveryChatPart[] = [];
          for (const part of modelParts) {
            if (!part.functionCall) continue;
            const callId = randomUUID();
            const fc = part.functionCall;
            yield { type: 'tool_call', callId, name: fc.name, args: fc.args };

            const { response, rowEvent } = await executeTool(fc, { filmId: session.filmId }, {
              filmStore: deps.filmStore,
              detailRowsStore: deps.detailRowsStore,
              discoveryJobStore: deps.discoveryJobStore,
              eventBus: deps.eventBus,
              videoSegmentDescriber: deps.videoSegmentDescriber,
            });
            yield { type: 'tool_result', callId, name: fc.name, result: response };
            if (rowEvent) yield rowEvent;

            responseParts.push({ functionResponse: { name: fc.name, response } });
          }
          persistedTurns.push({ role: 'user', parts: responseParts, ts: now() });
          await deps.discoveryChatSessionStore.updateSession(session.filmId, session.id, { turns: persistedTurns });

          if (signal?.aborted) {
            stopped = true;
            break;
          }
        }
        yield stopped ? { type: 'stopped' } : { type: 'turn_done' };
      } catch (err) {
        const isAbort = signal?.aborted || (err instanceof Error && err.name === 'AbortError');
        if (isAbort) {
          yield { type: 'stopped' };
        } else {
          yield { type: 'error', message: err instanceof Error ? err.message : 'unknown error' };
        }
      }
    },
  };
}
