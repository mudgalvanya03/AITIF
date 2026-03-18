/**
 * navRecorder.ts
 *
 * Records the URL that a page navigates to AFTER a successful action.
 * This is the "smart" part of adaptive recovery — during a healthy test run,
 * we silently record "login_button click → navigates to /inventory.html".
 * If login_button later fails all click strategies, we fall back to
 * navigating directly to /inventory.html.
 *
 * Usage:
 *   // In your healthy test (before any mutations):
 *   await recordNavigation(page, "login_button", async () => {
 *     await page.click("#login-button");
 *   });
 *
 *   // Later, adaptiveExecutor reads this automatically as a last resort.
 */

import fs from "fs/promises";
import path from "path";
import { Page } from "@playwright/test";


const NAV_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "recovery-logs",
  "nav-records.json"
);

interface NavRecord {
  stepName: string;
  urlBefore: string;
  urlAfter: string;
  recordedAt: string;
}

// ─── Save a nav record ────────────────────────────────────────────────────────

async function loadNavRecords(): Promise<Record<string, NavRecord>> {
  try {
    const raw = await fs.readFile(NAV_STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveNavRecords(
  records: Record<string, NavRecord>
): Promise<void> {
  await fs.mkdir(path.dirname(NAV_STORE_PATH), { recursive: true });
  await fs.writeFile(NAV_STORE_PATH, JSON.stringify(records, null, 2));
}

// ─── Record navigation during healthy run ────────────────────────────────────

export async function recordNavigation(
  page: Page,
  stepName: string,
  action: () => Promise<void>
): Promise<void> {
  const urlBefore = page.url();

  await action();

  // Wait briefly for navigation to settle
  await page.waitForTimeout(500);
  const urlAfter = page.url();

  // Only record if the URL actually changed — otherwise no point
  if (urlBefore !== urlAfter) {
    const records = await loadNavRecords();
    records[stepName] = {
      stepName,
      urlBefore,
      urlAfter,
      recordedAt: new Date().toISOString(),
    };
    await saveNavRecords(records);
    console.log(`Nav recorded for ${stepName}: ${urlBefore} → ${urlAfter}`);
  }
}

// ─── Load a recorded nav URL for fallback ────────────────────────────────────

export async function getRecordedNavUrl(
  stepName: string
): Promise<string | null> {
  const records = await loadNavRecords();
  return records[stepName]?.urlAfter ?? null;
}