/**
 * Manual, run-once-by-hand test for the real Research agent (Gemini + Parallel Web
 * Search via Vertex AI). Mirrors test_agent.py's role for Discovery.
 *
 * Requires the one-time GCP setup in docs/runbook.md to be done first: Vertex AI API
 * enabled, roles/aiplatform.user granted, and local ADC configured
 * (`gcloud auth application-default login --project silent-scholar-505618-u6`).
 *
 * Run with: npx tsx scripts/manual-research-test.ts   (from backend/)
 */
import { createResearchAgent } from '../src/services/researchAgent.js';
import { loadConfig } from '../src/config/env.js';

// Real, documented case (Pixar re-animated this exact Inside Out line for Japan,
// swapping broccoli for green peppers) — same case already used in
// mockResearchAgent.ts / mockDialogflowClient.ts, not invented dialogue.
const ITEMS = [
  {
    id: 'inside-out-broccoli',
    scriptLine: "I'm not eating that broccoli.",
    sceneDescription:
      'Riley, a young girl, pushes a plate of broccoli away from her at the family dinner table.',
  },
];

const RUBRICS = [
  {
    id: 'food-aversion',
    description: 'A food or drink reference that reads differently (or not at all) in the target country.',
  },
];

async function main() {
  const config = loadConfig();
  const agent = createResearchAgent({
    googleCloudProject: config.googleCloudProject,
    geminiLocation: config.geminiLocation,
    geminiModel: config.geminiModel,
    parallelApiKey: config.parallelApiKey,
  });

  console.log(`Calling Gemini (${config.geminiModel}) with Parallel Web Search grounding...`);
  const results = await agent.researchBatch({
    items: ITEMS,
    targetCountry: 'Japan',
    rubrics: RUBRICS,
    onBatchComplete: (progress) =>
      console.log(`batch ${progress.batchIndex + 1}/${progress.totalBatches} done`),
  });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Manual research test failed:', err);
  process.exit(1);
});
