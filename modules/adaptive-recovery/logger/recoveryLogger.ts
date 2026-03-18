/**
 * recoveryLogger.ts
 * Saves every recovery attempt to disk.
 * Uses the same ndjson append pattern as featureLogger
 * so there are no race conditions with parallel workers.
 * genai-summary module will read these logs later.
 */

import fs from "fs/promises";
import path from "path";
import { RecoveryLog } from "../core/ActionResult";

export async function logRecoveryAttempt(log: RecoveryLog): Promise<void> {
  const dirPath  = path.join(process.cwd(), "data", "recovery-logs");
  const filePath = path.join(dirPath, "recovery-history.ndjson");

  await fs.mkdir(dirPath, { recursive: true });

  const line = JSON.stringify(log) + "\n";
  await fs.appendFile(filePath, line, "utf-8");
}