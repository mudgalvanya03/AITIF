/**
 * reactiveAnalyzer.ts
 *
 * Reads healing-data.ndjson and recovery-history.ndjson to build
 * reactive signals for each step — how often it has broken historically.
 *
 * The more a locator has needed healing or workarounds, the higher
 * its reactive fragility score.
 */

import fs from "fs/promises";
import path from "path";
import { ReactiveSignals } from "../core/StabilityTypes";

const HEALING_DATA_PATH = path.join(
  process.cwd(), "data", "ml-dataset", "healing-data.ndjson"
);

const RECOVERY_DATA_PATH = path.join(
  process.cwd(), "data", "recovery-logs", "recovery-history.ndjson"
);

// ─── Load ndjson file safely ──────────────────────────────────────────────────

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

// ─── Main analyzer ────────────────────────────────────────────────────────────

export async function analyzeReactiveSignals(): Promise<Map<string, ReactiveSignals>> {
  const healingRecords = await loadNdjson(HEALING_DATA_PATH);
  const recoveryRecords = await loadNdjson(RECOVERY_DATA_PATH);

  const signalsMap = new Map<string, ReactiveSignals>();

  // ── Process healing records ──
  // stepName format: "login_button_full_drift" or "login_button_id_removed"
  // We strip the mutation suffix to get the base stepName
  for (const record of healingRecords) {
    const rawStep: string = record.stepName ?? "";

    // Strip mutation type suffix to get base step name
    const baseName = rawStep
      .replace(/_id_removed$/, "")
      .replace(/_class_renamed$/, "")
      .replace(/_attr_changed$/, "")
      .replace(/_id_and_class$/, "")
      .replace(/_full_drift$/, "");

    if (!signalsMap.has(baseName)) {
      signalsMap.set(baseName, {
        stepName: baseName,
        healCount: 0,
        recoveryCount: 0,
        fullDriftCount: 0,
        strategiesFailed: 0,
        lastHealed: null,
      });
    }

    const signals = signalsMap.get(baseName)!;

    // Count chosen=true records as heals (ML was called and picked this element)
    if (record.chosen === true) {
      signals.healCount += 1;
      signals.lastHealed = record.timestamp ?? signals.lastHealed;
    }

    // Count full_drift hits specifically — these are the worst breakage
    if (rawStep.endsWith("_full_drift") && record.chosen === true) {
      signals.fullDriftCount += 1;
    }
  }

  // ── Process recovery records ──
  for (const record of recoveryRecords) {
    const stepName: string = record.stepName ?? "";

    if (!signalsMap.has(stepName)) {
      signalsMap.set(stepName, {
        stepName,
        healCount: 0,
        recoveryCount: 0,
        fullDriftCount: 0,
        strategiesFailed: 0,
        lastHealed: null,
      });
    }

    const signals = signalsMap.get(stepName)!;

    // Count every recovery attempt
    signals.recoveryCount += 1;

    // Count how many strategies failed before one worked
    const attempts: any[] = record.attempts ?? [];
    const failedCount = attempts.filter((a: any) => !a.success).length;
    // Running average of strategies failed
    signals.strategiesFailed = Math.round(
      (signals.strategiesFailed + failedCount) / 2
    );
  }

  return signalsMap;
}