import { GoogleGenAI } from '@google/genai';
import type { GenAIClient, ResearchItem, ResearchResult, Rubric, TrendSuggestion } from './researchAgent.js';
import { stripJsonFences } from './researchAgent.js';
import type { ParallelSearchClient, ParallelSearchResultItem } from './parallelSearchClient.js';

const MAX_SUGGESTIONS_PER_ITEM = 2;

export interface TrendAgent {
  findTrendSuggestions(input: {
    items: Array<{ item: ResearchItem; result: ResearchResult }>;
    targetCountry: string;
    rubrics: Rubric[];
  }): Promise<Record<string, TrendSuggestion[]>>;
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

/** The rubric (if any) that made this item eligible for the Trend Agent — used both to
 * build a focused search query and to explain to Gemini what kind of match to look for. */
function triggeringRubric(result: ResearchResult, rubrics: Rubric[]): Rubric | undefined {
  const rubricById = new Map(rubrics.map((r) => [r.id, r]));
  for (const score of result.scores) {
    const rubric = rubricById.get(score.rubricId);
    if (rubric?.trendEligible) return rubric;
  }
  return undefined;
}

function buildQuery(targetCountry: string, item: ResearchItem, rubric: Rubric): string {
  return `${targetCountry}: trending slang, memes, or viral references relevant to "${item.sceneDescription}" (${rubric.description})`;
}

interface SearchedItem {
  item: ResearchItem;
  results: ParallelSearchResultItem[];
}

const PROMPT_TEMPLATE = `GOAL
You are the Trend Agent in a film localization pipeline. For each item below, you are
given live web search results about what is currently trending in target_country
relevant to that item's scene. Using ONLY those search results, propose up to 2
trend-sourced replacement suggestions per item — concrete, current, and grounded in
what the search results actually say. If none of the search results genuinely support
a good replacement for an item, return no suggestions for it. Do not invent a
suggestion that isn't backed by one of the given search results.

INPUT
{{INPUT_JSON}}

TASK, for each item:
1. Read the item's scene context and its search results.
2. Propose 0-2 suggestions, each grounded in exactly one search result from that
   item's list. Reference that result's exact url as source_url, unchanged.
3. Each suggestion needs concrete replacement text and a 1-2 sentence justification
   for why that specific trend fits the concern.

OUTPUT, return ONLY this JSON array, no other text, no markdown fences:
[
  {
    "item_id": "<id>",
    "suggestions": [
      { "text": "<replacement text>", "justification": "<1-2 sentences>",
        "source_url": "<must exactly match one of this item's search result urls>" }
    ]
  }
]`;

function buildPrompt(searched: SearchedItem[]): string {
  const payload = searched.map(({ item, results }) => ({
    id: item.id,
    scene_description: item.sceneDescription,
    script_line: item.scriptLine,
    search_results: results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet })),
  }));
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
    async findTrendSuggestions({ items, targetCountry, rubrics }) {
      if (items.length === 0) return {};

      const searched: SearchedItem[] = [];
      for (const { item, result } of items) {
        const rubric = triggeringRubric(result, rubrics);
        if (!rubric) continue;
        const results = await deps.parallelSearchClient.search({
          query: buildQuery(targetCountry, item, rubric),
        });
        if (results.length === 0) continue;
        searched.push({ item, results });
      }
      if (searched.length === 0) return {};

      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: buildPrompt(searched),
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

      const resultsByUrl = new Map(searched.map((s) => [s.item.id, new Map(s.results.map((r) => [r.url, r]))]));

      const output: Record<string, TrendSuggestion[]> = {};
      for (const entry of parsed as Array<Record<string, unknown>>) {
        const itemId = entry.item_id as string;
        const urlToResult = resultsByUrl.get(itemId);
        if (!urlToResult) continue;

        const suggestions: TrendSuggestion[] = [];
        for (const raw of (entry.suggestions as Array<Record<string, unknown>>) ?? []) {
          const sourceUrl = raw.source_url as string;
          const matched = urlToResult.get(sourceUrl);
          if (!matched) continue;
          suggestions.push({
            text: raw.text as string,
            justification: raw.justification as string,
            sourceUrl: matched.url,
            sourceTitle: matched.title,
            publishedDate: matched.publishedDate ?? '',
          });
          if (suggestions.length === MAX_SUGGESTIONS_PER_ITEM) break;
        }
        if (suggestions.length > 0) output[itemId] = suggestions;
      }
      return output;
    },
  };
}
