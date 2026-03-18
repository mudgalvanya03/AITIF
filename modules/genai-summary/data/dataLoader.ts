/**
 * dataLoader.ts
 *
 * Reads output from all three modules and assembles
 * a unified context object for the GenAI summarizer.
 *
 * Sources:
 *   Module 1 → data/ml-dataset/healing-data.ndjson
 *   Module 2 → data/recovery-logs/recovery-history.ndjson
 *   Module 4 → data/stability-reports/stability-report.json
 */

import fs from "fs/promises";
import path from "path";

export interface SummaryContext {
  // Module 1 — healing stats
  totalHealingRecords: number;
  totalHeals: number;            // chosen=true records
  topHealedSteps: { stepName: string; count: number }[];

  // Module 2 — recovery stats
  totalRecoveryAttempts: number;
  recoveredSuccessfully: number;
  failedRecoveries: number;
  topRecoveredSteps: { stepName: string; count: number; finalStrategy: string }[];

  // Module 4 — stability stats
  stabilityReport: any;          // Full report for detailed rendering
  criticalCount: number;
  fragileCount: number;
  watchCount: number;
  stableCount: number;
  topRisks: any[];
}

async function loadNdjson(filePath: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

async function loadJson(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadAllData(): Promise<SummaryContext> {
  const cwd = process.cwd();

  // ── Module 1: healing data ──
  const healingRecords = await loadNdjson(
    path.join(cwd, "data", "ml-dataset", "healing-data.ndjson")
  );

  const healCounts = new Map<string, number>();
  for (const r of healingRecords) {
    if (r.chosen === true) {
      const base = (r.stepName as string)
        .replace(/_id_removed$/, "")
        .replace(/_class_renamed$/, "")
        .replace(/_attr_changed$/, "")
        .replace(/_id_and_class$/, "")
        .replace(/_full_drift$/, "");
      healCounts.set(base, (healCounts.get(base) ?? 0) + 1);
    }
  }

  const topHealedSteps = Array.from(healCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([stepName, count]) => ({ stepName, count }));

  // ── Module 2: recovery data ──
  const recoveryRecords = await loadNdjson(
    path.join(cwd, "data", "recovery-logs", "recovery-history.ndjson")
  );

  const recoveryCounts = new Map<string, { count: number; finalStrategy: string }>();
  let recoveredSuccessfully = 0;
  let failedRecoveries = 0;

  for (const r of recoveryRecords) {
    const step = r.stepName as string;
    const existing = recoveryCounts.get(step) ?? { count: 0, finalStrategy: "" };
    recoveryCounts.set(step, {
      count: existing.count + 1,
      finalStrategy: r.finalStrategy ?? existing.finalStrategy,
    });
    if (r.recovered) recoveredSuccessfully++;
    else failedRecoveries++;
  }

  const topRecoveredSteps = Array.from(recoveryCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([stepName, data]) => ({
      stepName,
      count: data.count,
      finalStrategy: data.finalStrategy,
    }));

  // ── Module 4: stability report ──
  const stabilityReport = await loadJson(
    path.join(cwd, "data", "stability-reports", "stability-report.json")
  );

  return {
    totalHealingRecords: healingRecords.length,
    totalHeals: healCounts.size,
    topHealedSteps,

    totalRecoveryAttempts: recoveryRecords.length,
    recoveredSuccessfully,
    failedRecoveries,
    topRecoveredSteps,

    stabilityReport,
    criticalCount: stabilityReport?.summary?.critical ?? 0,
    fragileCount:  stabilityReport?.summary?.fragile  ?? 0,
    watchCount:    stabilityReport?.summary?.watch    ?? 0,
    stableCount:   stabilityReport?.summary?.stable   ?? 0,
    topRisks:      stabilityReport?.topRisks          ?? [],
  };
}