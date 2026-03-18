/**
 * index.ts — GenAI Summary entry point
 *
 * Orchestrates the full pipeline:
 *   1. Load data from Modules 1, 2 and 4
 *   2. Build prompts for non-technical and technical audiences
 *   3. Call Gemini Flash API for both summaries
 *   4. Generate HTML report with all findings
 *
 * Prerequisites:
 *   - Module 1 data:  data/ml-dataset/healing-data.ndjson
 *   - Module 2 data:  data/recovery-logs/recovery-history.ndjson
 *   - Module 4 data:  data/stability-reports/stability-report.json
 *   - .env file with: GEMINI_API_KEY=your_key_here
 *
 * Usage:
 *   npx ts-node modules/genai-summary/index.ts
 *
 * Output:
 *   data/genai-reports/aitif-report.html  ← open in browser
 */

import path from "path";
import dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { loadAllData }           from "./data/dataLoader";
import { buildNonTechPrompt,
         buildTechPrompt }       from "./prompts/promptBuilder";
import { callGemini }            from "./api/geminiClient";
import { generateHtmlReport }    from "./reporter/htmlReporter";

async function runGenAiSummary(): Promise<void> {
  console.log("\n[genai-summary] Starting...\n");

  // Step 1: Load all data
  console.log("[genai-summary] Loading data from all modules...");
  const ctx = await loadAllData();

  console.log(`[genai-summary] Healing records:   ${ctx.totalHealingRecords}`);
  console.log(`[genai-summary] Recovery attempts: ${ctx.totalRecoveryAttempts}`);
  console.log(`[genai-summary] Locators scored:   ${ctx.stabilityReport?.totalLocators ?? 0}`);
  console.log(`[genai-summary] Risk breakdown:     ${ctx.criticalCount} critical, ${ctx.fragileCount} fragile, ${ctx.watchCount} watch, ${ctx.stableCount} stable`);

  // Step 2: Generate non-technical summary
  console.log("\n[genai-summary] Calling Gemini for non-technical summary...");
  const nonTechPrompt = buildNonTechPrompt(ctx);
  const nonTechSummary = await callGemini(nonTechPrompt);
  console.log("[genai-summary] Non-technical summary received ✓");

  // Step 3: Generate technical summary
  console.log("[genai-summary] Calling Gemini for technical summary...");
  const techPrompt = buildTechPrompt(ctx);
  const techSummary = await callGemini(techPrompt);
  console.log("[genai-summary] Technical summary received ✓");

  // Step 4: Generate HTML report
  console.log("\n[genai-summary] Generating HTML report...");
  await generateHtmlReport(ctx, nonTechSummary, techSummary);

  console.log("\n[genai-summary] Done!");
  console.log("[genai-summary] Open the report in your browser:");
  console.log(`[genai-summary] → data/genai-reports/aitif-report.html\n`);
}

runGenAiSummary().catch((err) => {
  console.error("\n[genai-summary] Error:", err.message);
  if (err.message.includes("GEMINI_API_KEY")) {
    console.error("\nFix: Add GEMINI_API_KEY=your_key to your .env file");
    console.error("Get a free key at: https://aistudio.google.com\n");
  }
  process.exit(1);
});