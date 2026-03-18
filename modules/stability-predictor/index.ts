/**
 * index.ts  — Stability Predictor entry point
 *
 * Orchestrates the full pipeline:
 *   1. analyzeReactiveSignals()  — reads healing + recovery history
 *   2. analyzeProactiveSignals() — reads locator-store DOM snapshots
 *   3. scoreLocator()            — combines into 0-100 fragility score
 *   4. generateReport()         — prints console table + saves JSON
 *
 * Usage:
 *   npx ts-node modules/stability-predictor/index.ts
 *
 * Output:
 *   Console: colour-coded risk table
 *   File:    data/stability-reports/stability-report.json
 *            (read by genai-summary module)
 */

import { analyzeReactiveSignals }  from "./analyzers/reactiveAnalyzer";
import { analyzeProactiveSignals } from "./analyzers/proactiveAnalyzer";
import {
  scoreLocator,
  defaultReactiveSignals,
  defaultProactiveSignals,
} from "./scorer/stabilityScorer";
import { generateReport } from "./reporter/stabilityReporter";
import { StabilityScore }  from "./core/StabilityTypes";

async function runStabilityPredictor(): Promise<void> {
  console.log("\n[stability-predictor] Starting analysis...\n");

  // Step 1: Load reactive signals from history
  console.log("[stability-predictor] Reading healing + recovery history...");
  const reactiveMap  = await analyzeReactiveSignals();
  console.log(`[stability-predictor] Found reactive signals for ${reactiveMap.size} steps`);

  // Step 2: Load proactive signals from locator-store snapshots
  console.log("[stability-predictor] Reading locator-store DOM snapshots...");
  const proactiveMap = await analyzeProactiveSignals();
  console.log(`[stability-predictor] Found proactive signals for ${proactiveMap.size} steps`);

  // Step 3: Combine all known step names from both sources
  const allStepNames = new Set([
    ...reactiveMap.keys(),
    ...proactiveMap.keys(),
  ]);

  console.log(`[stability-predictor] Scoring ${allStepNames.size} unique locators...`);

  const scores: StabilityScore[] = [];

  for (const stepName of allStepNames) {
    const reactive  = reactiveMap.get(stepName)  ?? defaultReactiveSignals(stepName);
    const proactive = proactiveMap.get(stepName) ?? defaultProactiveSignals(stepName);
    const score     = scoreLocator(stepName, reactive, proactive);
    scores.push(score);
  }

  // Step 4: Generate and save report
  const report = await generateReport(scores);

  console.log(
    `[stability-predictor] Done. ` +
    `${report.summary.critical} critical, ` +
    `${report.summary.fragile} fragile, ` +
    `${report.summary.watch} watch, ` +
    `${report.summary.stable} stable.`
  );
}

runStabilityPredictor().catch(console.error);