/**
 * proactiveAnalyzer.ts
 *
 * Reads all locator-store JSON files (the snapshots collected by
 * LocatorCollector.ts during healthy test runs) and extracts DOM
 * fragility signals from them.
 *
 * These signals predict future breakage based on known fragility
 * patterns from test engineering research:
 *
 *   - No data-test / ID → relies on volatile attributes
 *   - Many classes → any class rename breaks the locator
 *   - Deep DOM → any structural refactor breaks it
 *   - Long text → copy changes break it
 *   - Many siblings → positional locators become ambiguous
 */

import fs from "fs/promises";
import path from "path";
import { ProactiveSignals } from "../core/StabilityTypes";

const LOCATOR_STORE_PATH = path.join(
  process.cwd(), "data", "locator-store"
);

// ─── Stable attribute names — these rarely change ────────────────────────────

const STABLE_ATTRS = ["data-test", "data-testid", "data-cy", "data-qa"];

// ─── Analyze a single locator metadata snapshot ───────────────────────────────

function analyzeSnapshot(stepName: string, metadata: any): ProactiveSignals {
  const attrs: Record<string, string> = metadata.attributes ?? {};
  const classes: string[] = metadata.classes ?? [];
  const text: string = metadata.text ?? "";
  const depth: number = typeof metadata.depth === "number" ? metadata.depth : 0;
  const siblingCount: number = typeof metadata.siblingCount === "number"
    ? metadata.siblingCount
    : 0;

  const hasId = !!(metadata.id && metadata.id.trim().length > 0);
  const hasDataTest = STABLE_ATTRS.some(attr => attrs[attr] !== undefined);

  // Detect positional usage — if no stable attribute AND many siblings,
  // the locator is likely positional (nth-child etc)
  const isPositional = !hasId && !hasDataTest && siblingCount > 3;

  return {
    stepName,
    hasId,
    hasDataTest,
    classCount: classes.filter(c => c.trim().length > 0).length,
    domDepth: depth,
    textLength: text.length,
    siblingCount,
    isPositional,
    tag: metadata.tag ?? "unknown",
  };
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export async function analyzeProactiveSignals(): Promise<Map<string, ProactiveSignals>> {
  const signalsMap = new Map<string, ProactiveSignals>();

  let files: string[] = [];

  try {
    files = await fs.readdir(LOCATOR_STORE_PATH);
  } catch {
    console.warn("[stability] No locator-store directory found. Run tests first.");
    return signalsMap;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const stepName = file.replace(".json", "");
    const filePath = path.join(LOCATOR_STORE_PATH, file);

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);

      // locator-store files can be a single object or an array
      // If array, use the latest snapshot (last entry)
      const metadata = Array.isArray(parsed)
        ? parsed[parsed.length - 1]
        : parsed;

      if (!metadata) continue;

      const signals = analyzeSnapshot(stepName, metadata);
      signalsMap.set(stepName, signals);

    } catch {
      // Malformed file — skip
    }
  }

  return signalsMap;
}