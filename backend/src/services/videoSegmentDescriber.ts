import { GoogleGenAI } from '@google/genai';
import type { GenAIClient } from './discoveryAgent.js';

export interface DescribeVideoSegmentInput {
  videoUrl: string;
  startMs: number;
  endMs: number;
  focus?: string;
}

export interface VideoSegmentDescriber {
  describeVideoSegment(input: DescribeVideoSegmentInput): Promise<string>;
}

/** Bounds a single clip request's latency/cost — the model can ask for more
 * segments one at a time instead of one huge one. */
export const MAX_CLIP_MS = 60_000;

const SYSTEM_INSTRUCTION = `You are assisting a cultural-localization reviewer of a
film. You will be shown a short clip. Describe, in 2-4 concrete sentences, what is
visibly happening — actions, objects, on-screen text, gestures, and facial
expressions relevant to how well the scene will translate to other cultures. Be
specific to this clip, not generic.`;

export function createVideoSegmentDescriber(
  config: { googleCloudProject: string; geminiLocation: string; geminiModel: string },
  deps: { genAI?: GenAIClient } = {},
): VideoSegmentDescriber {
  const ai: GenAIClient =
    deps.genAI ?? new GoogleGenAI({ vertexai: true, project: config.googleCloudProject, location: config.geminiLocation });

  return {
    async describeVideoSegment({ videoUrl, startMs, endMs, focus }) {
      if (!(endMs > startMs)) {
        throw new Error('endMs must be greater than startMs');
      }
      if (endMs - startMs > MAX_CLIP_MS) {
        throw new Error(`clip too long — max ${MAX_CLIP_MS}ms per call`);
      }

      const startOffset = `${Math.floor(startMs / 1000)}s`;
      const endOffset = `${Math.ceil(endMs / 1000)}s`;

      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [
              { text: focus ? `Pay particular attention to: ${focus}` : 'Describe this clip.' },
              { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' }, videoMetadata: { startOffset, endOffset } },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error('video segment describer returned an empty response');
      return text;
    },
  };
}
