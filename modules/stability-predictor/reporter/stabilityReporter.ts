/**
 * stabilityReporter.ts
 *
 * Generates two outputs:
 *   1. Console report — colour-coded risk table printed to terminal
 *   2. JSON report    — saved to data/stability-reports/stability-report.json
 *                       This is what genai-summary will read later
 */

import fs from "fs/promises";
import path from "path";
import { StabilityReport, StabilityScore, RiskLevel } from "../core/StabilityTypes";

const REPORT_DIR  = path.join(process.cwd(), "data", "stability-reports");
const REPORT_PATH = path.join(REPORT_DIR, "stability-report.json");

// ─── Risk level formatting ────────────────────────────────────────────────────

const RISK_ICONS: Record<RiskLevel, string> = {
  STABLE:   "✓",
  WATCH:    "~",
  FRAGILE:  "!",
  CRITICAL: "✕",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  STABLE:   "STABLE  ",
  WATCH:    "WATCH   ",
  FRAGILE:  "FRAGILE ",
  CRITICAL: "CRITICAL",
};

// ─── Console reporter ─────────────────────────────────────────────────────────

function printConsoleReport(report: StabilityReport): void {
  console.log("\n" + "=".repeat(70));
  console.log("  AITIF STABILITY REPORT");
  console.log("=".repeat(70));
  console.log(`  Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  console.log(`  Locators analyzed: ${report.totalLocators}`);
  console.log();
  console.log(`  STABLE:   ${report.summary.stable}`);
  console.log(`  WATCH:    ${report.summary.watch}`);
  console.log(`  FRAGILE:  ${report.summary.fragile}`);
  console.log(`  CRITICAL: ${report.summary.critical}`);
  console.log("=".repeat(70));

  if (report.topRisks.length > 0) {
    console.log("\n  TOP RISKS (fix these first):\n");

    for (const score of report.topRisks) {
      const icon  = RISK_ICONS[score.riskLevel];
      const label = RISK_LABELS[score.riskLevel];
      console.log(`  ${icon} [${label}] ${score.stepName.padEnd(35)} score: ${score.totalScore}/100`);
      console.log(`       → ${score.recommendation}`);
      console.log();
    }
  }

  console.log("=".repeat(70));
  console.log("\n  FULL BREAKDOWN:\n");
  console.log(
    "  " +
    "Step Name".padEnd(35) +
    "Risk".padEnd(12) +
    "Score".padEnd(8) +
    "Reactive".padEnd(12) +
    "Proactive"
  );
  console.log("  " + "-".repeat(67));

  for (const score of report.scores) {
    const icon  = RISK_ICONS[score.riskLevel];
    const label = RISK_LABELS[score.riskLevel];
    const name  = score.stepName.length > 33
      ? score.stepName.substring(0, 30) + "..."
      : score.stepName;

    console.log(
      `  ${icon} ` +
      name.padEnd(35) +
      label.padEnd(12) +
      String(score.totalScore).padEnd(8) +
      String(score.reactiveScore).padEnd(12) +
      String(score.proactiveScore)
    );
  }

  console.log("\n" + "=".repeat(70));
  console.log(`  Full report saved → ${REPORT_PATH}`);
  console.log("=".repeat(70) + "\n");
}

// ─── Save JSON report ─────────────────────────────────────────────────────────

async function saveJsonReport(report: StabilityReport): Promise<void> {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
}

// ─── Main reporter ────────────────────────────────────────────────────────────

export async function generateReport(scores: StabilityScore[]): Promise<StabilityReport> {

  // Sort by totalScore descending — worst first
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);

  const summary = {
    stable:   sorted.filter(s => s.riskLevel === "STABLE").length,
    watch:    sorted.filter(s => s.riskLevel === "WATCH").length,
    fragile:  sorted.filter(s => s.riskLevel === "FRAGILE").length,
    critical: sorted.filter(s => s.riskLevel === "CRITICAL").length,
  };

  const report: StabilityReport = {
    generatedAt: new Date().toISOString(),
    totalLocators: sorted.length,
    summary,
    scores: sorted,
    topRisks: sorted
      .filter(s => s.riskLevel === "CRITICAL" || s.riskLevel === "FRAGILE")
      .slice(0, 5),
  };

  printConsoleReport(report);
  await saveJsonReport(report);

  return report;
}