import { GoogleGenAI } from '@google/genai';
import type { Rubric, ResearchResult } from './projectTypes.js';

export type { Rubric, RubricScore, SuggestedReplacement, TrendSuggestion, ResearchResult } from './projectTypes.js';

export interface ResearchItem {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export interface ResearchBatchProgress {
  batchIndex: number;
  totalBatches: number;
  itemIds: string[];
  results: ResearchResult[];
}

export interface ResearchAgent {
  researchBatch(input: {
    items: ResearchItem[];
    targetCountry: string;
    rubrics: Rubric[];
    /** Fired after each sequential batch call finishes — lets a caller (e.g. an SSE
     * route) report incremental progress without changing the batching logic itself. */
    onBatchComplete?: (progress: ResearchBatchProgress) => void | Promise<void>;
  }): Promise<ResearchResult[]>;
}

export const BATCH_SIZE = 10;

const PROMPT_TEMPLATE = `GOAL
You are the Research Agent in a film localization pipeline. For each item you
receive, score how strongly it matches EVERY rubric below, then decide whether
the item should be transcreated for the target country. If it should, propose
one concrete replacement. You do NOT rank items against each other, another
agent (Prioritization) does that using the scores you produce here.

SCORE MEANING
A rubric's score for an item measures how strongly the item exhibits the
concern that rubric describes, not how well the item would land in the target
country and not whether it should change. 0 means the item does not trigger
this rubric's concern at all. 10 means it is a clear, strong match for the
concern. Score every rubric this way, independent of what you'll eventually
conclude in your summary. Each rubric also carries a "weight" (1-5) indicating
how much it will count toward this item's overall importance once scores are
aggregated downstream — this does NOT change how you score the rubric itself,
weight is informational context only, score purely on how strongly the
concern applies.

INPUT
{{INPUT_JSON}}

TASK, for each item:
1. Read script_line and scene_description together.
2. Score the item against EVERY rubric listed in the input, in the order
   given. Do not skip any rubric, even one that plainly does not apply, an
   inapplicable rubric still gets an entry, with a low score and a short
   reasoning explaining why it doesn't apply.
3. Search the web only when you are genuinely uncertain how a specific
   reference, food, gesture, or joke actually reads in target_country. If a
   rubric plainly does not apply, or you already know with confidence how it
   reads, score it from general knowledge and leave that entry's sources
   empty, do not spend a search on it. Reserve web search for the cases where
   the right score or reasoning is genuinely unclear without checking.
4. After scoring every rubric, write one summary that synthesizes across all
   of that item's scores, not a re-listing of them, into a 2-3 sentence
   verdict: should this item be transcreated for target_country, and why.
5. Set should_transcreate to true only if your summary concludes the item
   should change. When true, propose exactly one suggested_replacement:
   concrete replacement text for the line or scene, plus a 1-2 sentence
   justification for why that specific replacement addresses the concern.
   When false, omit suggested_replacement (or set it to null).

OUTPUT, return ONLY this JSON array, no other text, no markdown fences:
[
  {
    "item_id": "<id>",
    "target_country": "<country>",
    "scores": [
      { "rubric_id": "<id>", "score": <integer 0-10>,
        "reasoning": "<1-2 sentences, why this score>",
        "evidence": "<1-2 sentences of support, web-sourced if you searched,
          general knowledge if you didn't>",
        "sources": ["<the full URL of the page you actually read, e.g.
          https://example.com/article>"] }
    ],
    "summary": "<2-3 sentence synthesis across all of this item's scores>",
    "should_transcreate": <true|false>,
    "suggested_replacement": { "text": "<replacement line or scene note>",
      "justification": "<1-2 sentences>" } | null
  }
]
The "scores" array must contain exactly one entry per rubric given in the
input, in the same order, for every item, never fewer, never more.
Every string in a "sources" array must be a full "http(s)://" URL. Never
write a bare citation number or footnote marker (e.g. "4") in its place —
if you don't have the literal URL for a rubric you searched, leave that
rubric's sources array empty ([]) instead.`;

function buildPrompt(batch: ResearchItem[], targetCountry: string, rubrics: Rubric[]): string {
  const payload = {
    target_country: targetCountry,
    rubrics: rubrics.map((r) => ({ id: r.id, description: r.description, weight: r.weight })),
    items: batch.map((i) => ({
      id: i.id,
      script_line: i.scriptLine,
      scene_description: i.sceneDescription,
    })),
  };
  return PROMPT_TEMPLATE.replace('{{INPUT_JSON}}', JSON.stringify(payload, null, 2));
}

/** Strips a ```json ... ``` (or bare ```) code fence Gemini sometimes wraps its JSON response in. */
export function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    const newlineIdx = t.indexOf('\n');
    t = newlineIdx !== -1 ? t.slice(newlineIdx + 1) : t;
    if (t.endsWith('```')) {
      t = t.slice(0, -3);
    }
  }
  return t.trim();
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ResearchAgentConfig {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
  parallelApiKey?: string;
}

/** Narrow slice of the GoogleGenAI client this service actually calls — lets tests
 * inject a fake without touching ADC or the real Vertex AI SDK. */
export interface GenAIClient {
  models: {
    generateContent(params: unknown): Promise<{
      text?: string;
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string } }>;
        };
      }>;
    }>;
  };
}

const URL_PATTERN = /^https?:\/\//i;

/** The model is asked to write full URLs into "sources", but when the parallelAiSearch
 * grounding tool is on it sometimes reverts to writing a bare citation number (e.g. "4")
 * instead — a habit from grounded-answer footnotes. Resolve any such number against this
 * call's actual grounding chunks (tried as both a 0- and 1-indexed reference, since the
 * model's own indexing convention isn't guaranteed) rather than persisting a broken
 * numeric "source" that renders as a dead link. */
function resolveSources(raw: string[], groundingUrls: string[]): string[] {
  return raw
    .map((src) => {
      if (URL_PATTERN.test(src)) return src;
      const idx = Number(src);
      if (!Number.isInteger(idx)) return null;
      return groundingUrls[idx] ?? groundingUrls[idx - 1] ?? null;
    })
    .filter((s): s is string => Boolean(s));
}

export interface ResearchAgentDeps {
  genAI?: GenAIClient;
}

export function createResearchAgent(
  config: ResearchAgentConfig,
  deps: ResearchAgentDeps = {},
): ResearchAgent {
  const ai: GenAIClient =
    deps.genAI ??
    new GoogleGenAI({
      vertexai: true,
      project: config.googleCloudProject,
      location: config.geminiLocation,
    });

  return {
    async researchBatch({ items, targetCountry, rubrics, onBatchComplete }) {
      const results: ResearchResult[] = [];
      const batches = chunk(items, BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const response = await ai.models.generateContent({
          model: config.geminiModel,
          contents: buildPrompt(batch, targetCountry, rubrics),
          config: {
            tools: [
              { parallelAiSearch: config.parallelApiKey ? { apiKey: config.parallelApiKey } : {} },
            ],
          },
        });
        const text = response.text;
        if (!text) throw new Error('Research agent returned an empty response');
        const cleaned = stripJsonFences(text);

        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          throw new Error(`Research agent response wasn't valid JSON: ${text}`);
        }

        const groundingUrls = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
          .map((c) => c.web?.uri)
          .filter((u): u is string => Boolean(u));

        const scoredAt = new Date().toISOString();
        const batchResults: ResearchResult[] = (parsed as Array<Record<string, unknown>>).map(
          (r) => ({
            itemId: r.item_id as string,
            targetCountry: r.target_country as string,
            scores: ((r.scores as Array<Record<string, unknown>>) ?? []).map((s) => ({
              rubricId: s.rubric_id as string,
              score: s.score as number,
              reasoning: s.reasoning as string,
              evidence: s.evidence as string,
              sources: resolveSources((s.sources as string[]) ?? [], groundingUrls),
              updatedAt: scoredAt,
              updatedBy: 'batch-agent' as const,
            })),
            summary: r.summary as string,
            shouldTranscreate: Boolean(r.should_transcreate),
            ...(r.suggested_replacement
              ? {
                  suggestedReplacement: {
                    text: (r.suggested_replacement as Record<string, unknown>).text as string,
                    justification: (r.suggested_replacement as Record<string, unknown>)
                      .justification as string,
                  },
                }
              : {}),
          }),
        );
        results.push(...batchResults);
        await onBatchComplete?.({
          batchIndex,
          totalBatches: batches.length,
          itemIds: batch.map((i) => i.id),
          results: batchResults,
        });
      }
      return results;
    },
  };
}
