import { GoogleGenAI } from '@google/genai';
import type { GenAIClient, ResearchItem, Rubric, TrendSuggestion } from './researchAgent.js';
import { stripJsonFences } from './researchAgent.js';
import type { ParallelSearchClient, ParallelSearchResultItem } from './parallelSearchClient.js';

const MAX_SUGGESTIONS_PER_ITEM = 2;

/**
 * Ungated by design: unlike the (removed) automatic research-run chaining, this is
 * only ever invoked by a deliberate, per-item user action (the "Find Trend-Sourced
 * Alternative" button) — the click itself is the trigger, so there is no
 * shouldTranscreate/score check here. The caller decides which rubric(s) to search
 * for (normally the project's trend-eligible rubric(s)).
 */
export interface TrendAgent {
  findTrendSuggestions(input: {
    item: ResearchItem;
    targetCountry: string;
    rubrics: Rubric[];
  }): Promise<TrendSuggestion[]>;
}

export interface TrendAgentConfig {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
}

export interface TrendAgentDeps {
  genAI?: GenAIClient;
  parallelSearchClient: ParallelSearchClient;
}

function buildQuery(targetCountry: string, item: ResearchItem, rubric: Rubric): string {
  return `${targetCountry}: trending slang, memes, or viral references relevant to "${item.sceneDescription}" (${rubric.description})`;
}

const PROMPT_TEMPLATE = `GOAL
You are the Trend Agent in a film localization pipeline. You are given live web
search results about what is currently trending in target_country relevant to one
item's scene. Using ONLY those search results, propose up to 2 trend-sourced
replacement suggestions — concrete, current, and grounded in what the search results
actually say. If none of the search results genuinely support a good replacement,
return an empty array. Do not invent a suggestion that isn't backed by one of the
given search results.

INPUT
{{INPUT_JSON}}

TASK
1. Read the item's scene context and the search results.
2. Propose 0-2 suggestions, each grounded in exactly one search result.
   Reference that result's exact url as source_url, unchanged.
3. Each suggestion needs concrete replacement text and a 1-2 sentence justification
   for why that specific trend fits the concern.

OUTPUT, return ONLY this JSON array, no other text, no markdown fences:
[
  { "text": "<replacement text>", "justification": "<1-2 sentences>",
    "source_url": "<must exactly match one of the given search result urls>" }
]`;

function buildPrompt(item: ResearchItem, results: ParallelSearchResultItem[]): string {
  const payload = {
    scene_description: item.sceneDescription,
    script_line: item.scriptLine,
    search_results: results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet })),
  };
  return PROMPT_TEMPLATE.replace('{{INPUT_JSON}}', JSON.stringify(payload, null, 2));
}

export function createTrendAgent(config: TrendAgentConfig, deps: TrendAgentDeps): TrendAgent {
  const ai: GenAIClient =
    deps.genAI ??
    new GoogleGenAI({
      vertexai: true,
      project: config.googleCloudProject,
      location: config.geminiLocation,
    });

  return {
    async findTrendSuggestions({ item, targetCountry, rubrics }) {
      if (rubrics.length === 0) return [];

      const results: ParallelSearchResultItem[] = [];
      for (const rubric of rubrics) {
        const found = await deps.parallelSearchClient.search({ query: buildQuery(targetCountry, item, rubric) });
        results.push(...found);
      }
      if (results.length === 0) return [];

      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: buildPrompt(item, results),
      });
      const text = response.text;
      if (!text) throw new Error('Trend agent returned an empty response');
      const cleaned = stripJsonFences(text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Trend agent response wasn't valid JSON: ${text}`);
      }

      const resultByUrl = new Map(results.map((r) => [r.url, r]));

      const output: TrendSuggestion[] = [];
      for (const raw of parsed as Array<Record<string, unknown>>) {
        const sourceUrl = raw.source_url as string;
        const matched = resultByUrl.get(sourceUrl);
        if (!matched) continue;
        output.push({
          text: raw.text as string,
          justification: raw.justification as string,
          sourceUrl: matched.url,
          sourceTitle: matched.title,
          publishedDate: matched.publishedDate ?? '',
        });
        if (output.length === MAX_SUGGESTIONS_PER_ITEM) break;
      }
      return output;
    },
  };
}
