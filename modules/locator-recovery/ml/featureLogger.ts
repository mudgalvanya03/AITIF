import fs from "fs/promises";
import path from "path";

/**
 * featureLogger.ts  (race-condition safe version)
 *
 * PROBLEM WITH OLD VERSION:
 *   Every call did: read entire file → parse → push → rewrite entire file
 *   With parallel Playwright workers, this caused race conditions:
 *   Worker A and B both read 100 records, both push 1 record,
 *   last writer wins → one record lost. With many workers, most data was lost.
 *
 * FIX:
 *   Append each record as a single line to a .ndjson file (newline-delimited JSON).
 *   fs.appendFile is atomic per-line — no read/parse/rewrite cycle.
 *   exportDataset.ts is updated to read .ndjson format.
 *
 * ALTERNATIVE (if you want to keep .json format):
 *   Run playwright with workers=1 via playwright.dataset.config.ts
 *   and keep this file as-is. Both fixes together = bulletproof.
 */
export async function logFeatureVector(record: any) {

  const dirPath = path.join(process.cwd(), "data", "ml-dataset");
  const filePath = path.join(dirPath, "healing-data.ndjson");

  // Ensure directory exists
  await fs.mkdir(dirPath, { recursive: true });

  // Append one JSON line — atomic, safe for parallel workers
  const line = JSON.stringify(record) + "\n";
  await fs.appendFile(filePath, line, "utf-8");
}