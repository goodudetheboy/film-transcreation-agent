import { GoogleGenAI } from '@google/genai';

export interface ResearchItem {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export interface Rubric {
  id: string;
  description: string;
}

export interface RubricFinding {
  rubricId: string;
  reasonToChange: string;
  evidence: string;
  sources: string[];
  changeDirection: string;
}

export interface ResearchResult {
  itemId: string;
  targetCountry: string;
  findings: RubricFinding[];
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
    onBatchComplete?: (progress: ResearchBatchProgress) => void;
  }): Promise<ResearchResult[]>;
}

export const BATCH_SIZE = 10;

const PROMPT_TEMPLATE = `GOAL
You are the Research Agent in a film localization pipeline. For each item you
receive, decide whether it risks not landing the same way in the target
country, gather real evidence from the web, and report findings. You do NOT
rank items against each other and you do NOT propose a final fix, another
agent does both of those.

INPUT
{{INPUT_JSON}}

TASK, for each item:
1. Read script_line and scene_description together.
2. Decide which rubrics could plausibly apply. Skip ones that clearly don't.
3. For each rubric that applies, search the web for how this reference, food,
   gesture, or joke actually reads in target_country. Do not guess from your
   own knowledge alone, search for it.
4. Note the reason it may not land, the evidence you found (with source
   URLs), and the direction a fix could take, not the fix itself.

OUTPUT, return ONLY this JSON array, no other text, no markdown fences:
[
  {
    "item_id": "<id>",
    "target_country": "<country>",
    "findings": [
      { "rubric_id": "<id>", "reason_to_change": "<1-2 sentences>",
        "evidence": "<1-2 sentences>", "sources": ["<url>"],
        "change_direction": "<short note, not a finished fix>" }
    ]
  }
]
If no rubric applies to an item, still include it, with an empty findings array.`;

function buildPrompt(batch: ResearchItem[], targetCountry: string, rubrics: Rubric[]): string {
  const payload = {
    target_country: targetCountry,
    rubrics: rubrics.map((r) => ({ id: r.id, description: r.description })),
    items: batch.map((i) => ({
      id: i.id,
      script_line: i.scriptLine,
      scene_description: i.sceneDescription,
    })),
  };
  return PROMPT_TEMPLATE.replace('{{INPUT_JSON}}', JSON.stringify(payload, null, 2));
}

/** Mirrors stripJsonFences() in dialogflowClient.ts (duplicated, not imported, to keep
 * Research decoupled from Discovery). */
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
    generateContent(params: unknown): Promise<{ text?: string }>;
  };
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

        const batchResults: ResearchResult[] = (parsed as Array<Record<string, unknown>>).map(
          (r) => ({
            itemId: r.item_id as string,
            targetCountry: r.target_country as string,
            findings: ((r.findings as Array<Record<string, unknown>>) ?? []).map((f) => ({
              rubricId: f.rubric_id as string,
              reasonToChange: f.reason_to_change as string,
              evidence: f.evidence as string,
              sources: (f.sources as string[]) ?? [],
              changeDirection: f.change_direction as string,
            })),
          }),
        );
        results.push(...batchResults);
        onBatchComplete?.({
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
