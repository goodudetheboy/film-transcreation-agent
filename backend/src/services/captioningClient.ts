import { GoogleGenAI, MediaResolution, Type } from '@google/genai';

/**
 * Mirrors DialogueLine/GestureLog/GestureDetectionResult in captioning_test.py
 * exactly — same prompt, same fields, same intent (transcribe dialogue, log
 * physical gestures/expressions, don't interpret cultural meaning yet).
 * See docs/adr/0015.
 */
export interface DialogueLine {
  timecode: string;
  character: string;
  text: string;
}

export interface GestureLog {
  timecode: string;
  character: string;
  gesture: string;
  expression: string;
  narrativeLoad: string;
  backgroundNote: string;
}

export interface CaptioningResult {
  dialogue: DialogueLine[];
  gestures: GestureLog[];
}

export interface CaptioningClient {
  preprocessVideo(input: { videoUrl: string }): Promise<CaptioningResult>;
}

const GESTURE_PROMPT = `
Watch this video and produce two timecode-anchored logs.

We are tracking a lot of signals at once (dialogue, gestures, expressions,
background), so be selective: only log something when it's actually there.
Do not pad entries with empty commentary — an empty/omitted field is the
correct output when that signal isn't present at that moment.

1. dialogue: every spoken line, verbatim, in order.
   - timecode
   - which character is speaking
   - the line of dialogue (text)

2. gestures: notable hand gestures, head movements, or body-language cues
   performed by a character (thumbs up, OK sign, head nod, head shake,
   pointing, etc.), anchored to the same timecode scheme as dialogue so the
   two logs can be cross-referenced.
   Only add a new entry when something changes in a noticeable way from the
   moment before — a held pose, a continuing gesture, or someone just
   talking with no distinct physical cue does NOT need its own entry. Do
   not log continuously or repeat the same state; skip a scene entirely if
   nothing about it is worth flagging.
   For each entry, note:
   - timecode
   - which character performs it
   - gesture: description of the physical gesture/body-language cue. Leave
     empty if nothing notable is happening physically at that moment (e.g.
     a character is just talking with no distinct gesture).
   - expression: the character's facial expression, only if it's notable
     (surprise, a smirk, gritted teeth). Leave empty for a neutral or
     unremarkable expression.
   - narrativeLoad: how load-bearing this gesture/expression is to the
     scene (does dialogue or a joke depend on it, or is it incidental).
   - backgroundNote: is there anything standout in the background at that
     same moment — a notable object, prop, sign, or detail worth flagging?
     Keep this brief and only fill it in if something genuinely stands out
     (e.g. leave it empty when the scene is a plain shot of someone
     talking). This is a secondary note, not the main focus.

Do not interpret cultural meaning yet — just log what physically happens
and what is said.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    dialogue: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timecode: { type: Type.STRING },
          character: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['timecode', 'character', 'text'],
      },
    },
    gestures: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timecode: { type: Type.STRING },
          character: { type: Type.STRING },
          gesture: { type: Type.STRING },
          expression: { type: Type.STRING },
          narrativeLoad: { type: Type.STRING },
          backgroundNote: { type: Type.STRING },
        },
        required: ['timecode', 'character', 'gesture', 'expression', 'narrativeLoad', 'backgroundNote'],
      },
    },
  },
  required: ['dialogue', 'gestures'],
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
              { text: 'Transcribe the dialogue and log the gestures in this video.' },
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
          // Validated against a real 4-min clip: cuts latency substantially with
          // no observed quality loss for this extraction task (unlike lowering
          // fps below Gemini's fixed 1fps sampling, or switching to flash-lite,
          // both of which were tried and didn't help/regressed).
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
          thinkingConfig: { thinkingBudget: 0 },
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
      return JSON.parse(text) as CaptioningResult;
    },
  };
}
