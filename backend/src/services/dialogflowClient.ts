import { SessionsClient } from '@google-cloud/dialogflow-cx';
import { randomUUID } from 'node:crypto';

/**
 * Schema is provisional — inferred from test_agent.py's generic json.loads, not
 * confirmed against a real playbook response yet. See docs/adr/0002.
 */
export interface FlaggedLine {
  line: string;
  reason: string;
  suggestedReplacement: string;
  [key: string]: unknown;
}

export interface DialogflowClient {
  analyzeScript(input: { script: string; country: string }): Promise<FlaggedLine[]>;
}

/** Mirrors strip_json_fences() in test_agent.py exactly. */
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

export function createDialogflowClient(config: {
  googleCloudProject: string;
  dialogflowLocation: string;
  dialogflowAgentId: string;
}): DialogflowClient {
  const client = new SessionsClient({
    apiEndpoint: `${config.dialogflowLocation}-dialogflow.googleapis.com`,
  });

  return {
    async analyzeScript({ script, country }) {
      const sessionId = randomUUID();
      const sessionPath = client.projectLocationAgentSessionPath(
        config.googleCloudProject,
        config.dialogflowLocation,
        config.dialogflowAgentId,
        sessionId,
      );

      const [response] = await client.detectIntent({
        session: sessionPath,
        queryInput: {
          text: { text: 'analyze this scene' },
          languageCode: 'en',
        },
        queryParams: {
          parameters: {
            fields: {
              script: { stringValue: script },
              country: { stringValue: country },
            },
          },
        },
      });

      const messages = response.queryResult?.responseMessages ?? [];
      for (const msg of messages) {
        const text = msg.text?.text?.[0];
        if (text) {
          const cleaned = stripJsonFences(text);
          try {
            return JSON.parse(cleaned) as FlaggedLine[];
          } catch {
            throw new Error(`Dialogflow response wasn't valid JSON: ${text}`);
          }
        }
      }
      return [];
    },
  };
}
