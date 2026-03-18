/**
 * adaptiveExecutor.ts
 *
 * The main entry point for the adaptive-recovery module.
 * Exposes two functions the user calls instead of locator.click() / locator.fill():
 *
 *   adaptiveClick(page, locator, stepName)
 *   adaptiveFill(page, locator, stepName, value)
 *
 * Each function runs its strategy ladder in order.
 * Every attempt is recorded in a RecoveryLog and saved to disk.
 * If all strategies fail, it throws with the full attempt history attached
 * so the test failure message is informative.
 *
 * INTEGRATION WITH EXISTING CODE:
 *
 *   Before (in your test):
 *     const healed = await getHealedLocator(page, "#login-button", "login_button");
 *     await healed.click();                          ← breaks if element has issues
 *
 *   After:
 *     const healed = await getHealedLocator(page, "#login-button", "login_button");
 *     await adaptiveClick(page, healed, "login_button");  ← tries all strategies
 */

import { Page, Locator } from "@playwright/test";
import { RecoveryContext } from "../core/RecoveryContext";
import { RecoveryLog, StrategyResult } from "../core/ActionResult";
import { CLICK_STRATEGY_LADDER } from "../strategies/clickStrategies";
import { FILL_STRATEGY_LADDER } from "../strategies/fillStrategies";
import { getRecordedNavUrl } from "../strategies/navRecorder";
import { logRecoveryAttempt } from "../logger/recoveryLogger";


// ─── Internal: run a strategy ladder ─────────────────────────────────────────

async function runLadder(
  ctx: RecoveryContext,
  ladder: { name: any; fn: (ctx: RecoveryContext) => Promise<boolean> }[]
): Promise<{ attempts: StrategyResult[]; winner: string | null }> {
  const attempts: StrategyResult[] = [];

  for (const { name, fn } of ladder) {
    const start = Date.now();

    console.log(`[adaptive-recovery] trying ${name} for ${ctx.stepName}`);

    let success = false;
    let error: string | undefined;

    try {
      success = await fn(ctx);
    } catch (e) {
      error = String(e);
      success = false;
    }

    const result: StrategyResult = {
      strategy: name,
      success,
      error,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };

    attempts.push(result);

    if (success) {
      console.log(
        `[adaptive-recovery] ✓ ${name} succeeded for ${ctx.stepName}`
      );
      return { attempts, winner: name };
    }

    console.warn(`[adaptive-recovery] ✗ ${name} failed for ${ctx.stepName}`);
  }

  return { attempts, winner: null };
}

// ─── Internal: build and save recovery log ────────────────────────────────────

async function saveLog(
  log: RecoveryLog
): Promise<void> {
  await logRecoveryAttempt(log);

  if (log.recovered) {
    console.log(
      `[adaptive-recovery] Recovered "${log.stepName}" via ${log.finalStrategy} ` +
      `after ${log.attempts.length} attempt(s)`
    );
  } else {
    console.error(
      `[adaptive-recovery] All strategies exhausted for "${log.stepName}". ` +
      `Tried: ${log.attempts.map((a) => a.strategy).join(" → ")}`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * adaptiveClick
 *
 * Drop-in replacement for locator.click().
 * Runs the full click strategy ladder before giving up.
 * As a last resort, checks if a navigation URL was recorded for this step
 * and navigates directly if so.
 *
 * @throws Error with full attempt history if all strategies fail
 */
export async function adaptiveClick(
  page: Page,
  locator: Locator,
  stepName: string,
  timeout?: number
): Promise<void> {
  const ctx: RecoveryContext = { page, locator, stepName, timeout };
  const startTime = Date.now();

  const { attempts, winner } = await runLadder(ctx, CLICK_STRATEGY_LADDER);

  // If click ladder worked — log and return
  if (winner) {
    const log: RecoveryLog = {
      stepName,
      actionType: "click",
      attempts,
      finalStrategy: winner as any,
      recovered: true,
      totalDurationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    await saveLog(log);
    return;
  }

  // Last resort: check if we recorded a navigation URL for this step
  const recordedUrl = await getRecordedNavUrl(stepName);

  if (recordedUrl) {
    console.warn(
      `[adaptive-recovery] All click strategies failed for ${stepName}. ` +
      `Falling back to recorded URL: ${recordedUrl}`
    );

    try {
      await page.goto(recordedUrl, { waitUntil: "domcontentloaded" });

      const navAttempt: StrategyResult = {
        strategy: "direct_url_navigation",
        success: true,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      const log: RecoveryLog = {
        stepName,
        actionType: "navigate",
        attempts: [...attempts, navAttempt],
        finalStrategy: "direct_url_navigation",
        recovered: true,
        totalDurationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      await saveLog(log);
      return;

    } catch (navErr) {
      attempts.push({
        strategy: "direct_url_navigation",
        success: false,
        error: String(navErr),
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Everything failed — log and throw
  const log: RecoveryLog = {
    stepName,
    actionType: "click",
    attempts,
    finalStrategy: null,
    recovered: false,
    totalDurationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  await saveLog(log);

  const summary = attempts
    .map((a) => `${a.strategy}(${a.success ? "✓" : "✗"})`)
    .join(" → ");

  throw new Error(
    `[adaptive-recovery] adaptiveClick failed for "${stepName}". ` +
    `All strategies exhausted: ${summary}`
  );
}

/**
 * adaptiveFill
 *
 * Drop-in replacement for locator.fill().
 * Runs the full fill strategy ladder before giving up.
 *
 * @throws Error with full attempt history if all strategies fail
 */
export async function adaptiveFill(
  page: Page,
  locator: Locator,
  stepName: string,
  value: string,
  timeout?: number
): Promise<void> {
  const ctx: RecoveryContext = { page, locator, stepName, value, timeout };
  const startTime = Date.now();

  const { attempts, winner } = await runLadder(ctx, FILL_STRATEGY_LADDER);

  const log: RecoveryLog = {
    stepName,
    actionType: "fill",
    value,
    attempts,
    finalStrategy: winner as any,
    recovered: winner !== null,
    totalDurationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  await saveLog(log);

  if (winner) return;

  const summary = attempts
    .map((a) => `${a.strategy}(${a.success ? "✓" : "✗"})`)
    .join(" → ");

  throw new Error(
    `[adaptive-recovery] adaptiveFill failed for "${stepName}" with value "${value}". ` +
    `All strategies exhausted: ${summary}`
  );
}