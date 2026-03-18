/**
 * promptBuilder.ts
 *
 * Builds the prompts sent to Gemini.
 * Two prompts:
 *   1. Non-technical summary  — plain English for managers/stakeholders
 *   2. Technical summary      — detailed findings for developers
 */

import { SummaryContext } from "../data/dataLoader";

// ─── Non-technical prompt ─────────────────────────────────────────────────────

export function buildNonTechPrompt(ctx: SummaryContext): string {
  const topRiskNames = ctx.topRisks
    .slice(0, 5)
    .map(r => `"${r.stepName}" (risk: ${r.riskLevel})`)
    .join(", ");

  const topHealedNames = ctx.topHealedSteps
    .slice(0, 5)
    .map(h => `"${h.stepName}" (fixed ${h.count} times)`)
    .join(", ");

  return `
You are a test automation assistant writing a plain English summary for a non-technical project manager.
Keep the language simple, friendly, and avoid technical jargon.
Use short paragraphs. Be concise — maximum 200 words total.

Here is the data from our automated test health system:

AUTOMATED FIXES (Locator Healing):
- The system automatically fixed broken test selectors ${ctx.totalHeals} times
- Most frequently fixed elements: ${topHealedNames || "none"}

WORKAROUNDS APPLIED (Adaptive Recovery):
- The system applied interaction workarounds ${ctx.totalRecoveryAttempts} times
- Successfully recovered: ${ctx.recoveredSuccessfully} times
- Could not recover: ${ctx.failedRecoveries} times

STABILITY RISK ASSESSMENT:
- Elements at high risk of breaking: ${ctx.fragileCount + ctx.criticalCount}
- Elements to monitor: ${ctx.watchCount}
- Stable elements: ${ctx.stableCount}
- Most at-risk elements: ${topRiskNames || "none identified"}

Write a friendly, non-technical paragraph summary explaining:
1. How well the automated system is handling test maintenance
2. Which parts of the application need developer attention
3. One clear action the team should take

Do NOT use bullet points. Write in flowing paragraphs.
Do NOT mention technical terms like "locator", "selector", "DOM", "heuristic", or "ML".
`.trim();
}

// ─── Technical prompt ─────────────────────────────────────────────────────────

export function buildTechPrompt(ctx: SummaryContext): string {
  const topRisks = ctx.topRisks
    .slice(0, 5)
    .map(r =>
      `- ${r.stepName}: ${r.riskLevel} (score ${r.totalScore}/100) — ` +
      `healed ${r.reactiveSignals?.healCount ?? 0}x, ` +
      `recovered ${r.reactiveSignals?.recoveryCount ?? 0}x. ` +
      `${r.recommendation}`
    )
    .join("\n");

  const topHealed = ctx.topHealedSteps
    .slice(0, 5)
    .map(h => `- ${h.stepName}: healed ${h.count} times`)
    .join("\n");

  const topRecovered = ctx.topRecoveredSteps
    .slice(0, 5)
    .map(r => `- ${r.stepName}: ${r.count} recovery attempts, final strategy: ${r.finalStrategy}`)
    .join("\n");

  return `
You are a senior test automation engineer writing a technical summary report.
Be precise, use technical terminology, and focus on actionable findings.
Maximum 300 words. Use short paragraphs — no bullet points.

HEALING SUMMARY (Module 1 — ML Locator Recovery):
Total healing records: ${ctx.totalHealingRecords}
Unique locators healed: ${ctx.totalHeals}
Most healed locators:
${topHealed || "No healing data"}

ADAPTIVE RECOVERY SUMMARY (Module 2):
Total recovery attempts: ${ctx.totalRecoveryAttempts}
Successful recoveries: ${ctx.recoveredSuccessfully}
Failed recoveries: ${ctx.failedRecoveries}
Most recovered locators:
${topRecovered || "No recovery data"}

STABILITY PREDICTION SUMMARY (Module 4):
Critical: ${ctx.criticalCount} | Fragile: ${ctx.fragileCount} | Watch: ${ctx.watchCount} | Stable: ${ctx.stableCount}
Top risks:
${topRisks || "No stability data"}

Write a concise technical analysis covering:
1. Overall test suite health based on heal and recovery frequency
2. Which specific locators are most fragile and why
3. Concrete technical recommendations (e.g. add data-test attributes, reduce class dependencies)
4. Any patterns worth noting across the findings

Be direct and specific. Reference actual locator names from the data.
`.trim();
}