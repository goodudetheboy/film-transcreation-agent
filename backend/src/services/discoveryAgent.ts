import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type { ConversationTurn, DiscoveryResultRow, SubtitleEntry } from './filmTypes.js';
import { subtitleTextForRange } from './subtitleOverlap.js';

export interface DiscoveryPassInput {
  videoUrl: string;
  subtitleEntries: SubtitleEntry[];
  specialInstruction: string;
  targetColumns: string[];
  /**
   * Name/description for custom (non-builtin) target columns, keyed by column
   * key — surfaced to Gemini as real context for what a user-defined column is
   * asking for, instead of just the column's raw key. The three builtin
   * columns (segmentDescription/gesture/notes) don't need an entry here.
   */
  columnMeta?: Record<string, { name: string; description: string }>;
  priorConversation: ConversationTurn[];
  /** Present only on a comment-driven re-run of an already-run pass. */
  newComment?: string;
}

export interface DiscoveryPassResult {
  resultRows: DiscoveryResultRow[];
  updatedConversation: ConversationTurn[];
}

/**
 * Generalizes captioningClient.ts's Gemini video-understanding technique (same
 * model/call shape) into a dynamic-schema, multi-turn call: the prompt and
 * response schema are built per-pass from the pass's special instruction and
 * target columns, instead of a hardcoded dialogue/gesture shape. A re-run
 * replays `priorConversation` plus a new user turn with the comment, so Gemini
 * genuinely has the prior turns as context — that persisted/replayed
 * `contents` array IS the "remembers its own conversation" behavior, no
 * separate caching mechanism needed. See docs/adr/0019.
 */
export interface DiscoveryAgent {
  runPass(input: DiscoveryPassInput): Promise<DiscoveryPassResult>;
}

const CUSTOM_VALUE_KEYS = new Set(['segmentDescription', 'gesture', 'notes']);

function columnLabel(key: string, columnMeta?: Record<string, { name: string; description: string }>): string {
  if (key === 'segmentDescription') return 'Segment Description';
  if (key === 'gesture') return 'Gesture';
  if (key === 'notes') return 'Notes';
  return columnMeta?.[key]?.name ?? key;
}

function buildSystemInstruction(
  subtitleEntries: SubtitleEntry[],
  specialInstruction: string,
  targetColumns: string[],
  columnMeta?: Record<string, { name: string; description: string }>,
): string {
  const columnsDesc = targetColumns
    .map((c) => {
      const description = columnMeta?.[c]?.description;
      return description ? `- "${c}" (${columnLabel(c, columnMeta)}): ${description}` : `- "${c}" (${columnLabel(c, columnMeta)})`;
    })
    .join('\n');
  const entriesJson = JSON.stringify(subtitleEntries.map((e) => ({ startMs: e.startMs, endMs: e.endMs, text: e.text })));
  return `You are the Discovery Agent in a film localization triage pipeline. Watch the
attached video and find moments worth flagging for cultural-localization review.

SPECIAL INSTRUCTION FROM THE USER (follow this closely — it scopes what you look for):
${specialInstruction || '(none given — use your general judgment about what is worth flagging)'}

For each flagged moment, provide your own "startMs" and "endMs" (integer
milliseconds, endMs strictly greater than startMs) marking exactly the span
the finding covers. Do NOT feel constrained to match a subtitle entry's exact
boundaries — many worthwhile findings have no dialogue in them at all (a
visual gag, a gesture, on-screen text, a silent beat); for those, pick the
startMs/endMs that covers the moment on screen even though no subtitle line
overlaps it. Only use a dialogue line's own boundaries when the finding really
is anchored to that line being said.

For grounding only (the film's overall pacing/duration, and to help you time
non-dialogue findings relative to nearby lines) — you do NOT need to match
these boundaries — here is this film's subtitle track:
${entriesJson}

For each flagged moment, fill in ONLY these fields (the columns this pass was
asked to populate — leave every other field out entirely):
${columnsDesc}

Only flag moments that are genuinely worth a localization specialist's
attention. Do not pad the output with an entry for every subtitle line.`;
}

function buildResponseSchema(targetColumns: string[]) {
  const properties: Record<string, unknown> = {
    startMs: { type: Type.INTEGER },
    endMs: { type: Type.INTEGER },
  };
  for (const col of targetColumns) {
    properties[col] = { type: Type.STRING };
  }
  return {
    type: Type.OBJECT,
    properties: {
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties,
          required: ['startMs', 'endMs', ...targetColumns],
        },
      },
    },
    required: ['rows'],
  };
}

// Same generous ceiling as captioningClient.ts — a gesture/finding-dense video
// can produce a lot of rows, and a truncated response is worse than a slow one.
const MAX_OUTPUT_TOKENS = 65536;

/** Narrow slice of the GoogleGenAI client actually used — lets tests inject a fake. */
export interface GenAIClient {
  models: {
    generateContent(params: unknown): Promise<{
      text?: string;
      candidates?: Array<{ finishReason?: string }>;
    }>;
  };
}

export function createDiscoveryAgent(
  config: { googleCloudProject: string; geminiLocation: string; geminiModel: string },
  deps: { genAI?: GenAIClient } = {},
): DiscoveryAgent {
  const ai: GenAIClient =
    deps.genAI ??
    new GoogleGenAI({ vertexai: true, project: config.googleCloudProject, location: config.geminiLocation });

  return {
    async runPass({ videoUrl, subtitleEntries, specialInstruction, targetColumns, columnMeta, priorConversation, newComment }) {
      const contents: ConversationTurn[] = [...priorConversation];
      if (contents.length === 0) {
        contents.push({
          role: 'user',
          parts: [
            { text: 'Find and flag moments in this video per the system instruction.' },
            { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' } },
          ],
        });
      } else if (newComment) {
        contents.push({ role: 'user', parts: [{ text: newComment }] });
      }

      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          systemInstruction: buildSystemInstruction(subtitleEntries, specialInstruction, targetColumns, columnMeta),
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: buildResponseSchema(targetColumns),
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error(
          `discovery agent response was truncated (hit the ${MAX_OUTPUT_TOKENS}-token output limit) — result would be incomplete`,
        );
      }

      const text = response.text;
      if (!text) throw new Error('discovery agent returned no content');

      const parsed = JSON.parse(text) as { rows: Array<Record<string, string | number>> };

      const resultRows: DiscoveryResultRow[] = parsed.rows
        .filter((r) => {
          const startMs = Number(r.startMs);
          const endMs = Number(r.endMs);
          // Same range validation the freeform storage model itself enforces
          // (see docs/adr/0023) — a row here is only ever the agent's own
          // proposed span now, never derived from a matched subtitle entry.
          return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs >= 0 && endMs > startMs;
        })
        .map((r) => {
          const startMs = Number(r.startMs);
          const endMs = Number(r.endMs);
          const values: DiscoveryResultRow['values'] = {};
          for (const col of targetColumns) {
            if (CUSTOM_VALUE_KEYS.has(col)) {
              (values as Record<string, string>)[col] = String(r[col] ?? '');
            } else {
              values.custom = { ...(values.custom ?? {}), [col]: String(r[col] ?? '') };
            }
          }
          return {
            tempId: randomUUID(),
            startMs,
            endMs,
            subtitleText: subtitleTextForRange(subtitleEntries, startMs, endMs),
            values,
          };
        });

      return {
        resultRows,
        updatedConversation: [...contents, { role: 'model', parts: [{ text }] }],
      };
    },
  };
}
