import { GoogleGenAI, Type } from '@google/genai';

/**
 * Mirrors GestureLog/GestureDetectionResult in captioning_test.py exactly — same
 * prompt, same fields, same intent (log physical gestures, don't interpret
 * cultural meaning yet). See docs/adr/0012.
 */
export interface GestureLog {
  timecode: string;
  gesture: string;
  character: string;
  narrativeLoad: string;
  backgroundNote: string;
}

export interface CaptioningClient {
  preprocessVideo(input: { videoUrl: string }): Promise<GestureLog[]>;
}

const GESTURE_PROMPT = `
Watch this video and log every distinct hand gesture, head movement, or
body-language cue performed by a character (thumbs up, OK sign, head nod,
head shake, pointing, etc.).
For each one, note:
- timecode
- gesture description
- which character performs it
- how load-bearing it is to the scene (does dialogue or a joke depend on it,
  or is it incidental)
- background_note: at that same moment, is there anything standout in the
  background — a notable object, prop, sign, or detail worth flagging? Keep
  this brief and only fill it in if something genuinely stands out; leave it
  empty otherwise. This is a secondary note, not the main focus — gestures
  remain the primary thing to log.
Do not interpret cultural meaning yet — just log what physically happens.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gestures: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timecode: { type: Type.STRING },
          gesture: { type: Type.STRING },
          character: { type: Type.STRING },
          narrativeLoad: { type: Type.STRING },
          backgroundNote: { type: Type.STRING },
        },
        required: ['timecode', 'gesture', 'character', 'narrativeLoad', 'backgroundNote'],
      },
    },
  },
  required: ['gestures'],
};

// Generous ceiling — a long video can log a lot of gestures, and a response cut
// off mid-JSON is worse than a slow one. See docs/adr/0012 (truncation fix).
const MAX_OUTPUT_TOKENS = 65536;

export function createCaptioningClient(config: {
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
}): CaptioningClient {
  const client = new GoogleGenAI({
    vertexai: true,
    project: config.googleCloudProject,
    location: config.geminiLocation,
  });

  return {
    async preprocessVideo({ videoUrl }) {
      const response = await client.models.generateContent({
        model: config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Log the gestures in this video.' },
              { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' } },
            ],
          },
        ],
        config: {
          systemInstruction: GESTURE_PROMPT,
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error(
          `captioning model response was truncated (hit the ${MAX_OUTPUT_TOKENS}-token output limit) — result would be incomplete`,
        );
      }

      const text = response.text;
      if (!text) {
        throw new Error('captioning model returned no content');
      }
      const parsed = JSON.parse(text) as { gestures: GestureLog[] };
      return parsed.gestures;
    },
  };
}
