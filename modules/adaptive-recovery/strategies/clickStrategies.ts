/**
 * clickStrategies.ts
 *
 * The click strategy ladder — tried in order from least to most aggressive.
 * Each strategy is a self-contained async function that returns true/false.
 * If it returns false or throws, the executor moves to the next strategy.
 *
 * ORDER:
 *   1. normal_click            — standard Playwright click
 *   2. scroll_then_click       — scroll element into view first
 *   3. force_click             — bypass visibility check
 *   4. hover_then_click        — hover to trigger CSS state, then click
 *   5. keyboard_enter          — focus element and press Enter
 *   6. js_click                — JavaScript dispatchEvent click
 *   7. dismiss_overlay_then_click — close any modal/cookie banner blocking it
 */

import { RecoveryContext } from "../core/RecoveryContext";


const DEFAULT_TIMEOUT = 3000;

// ─── Strategy 1: Normal click ─────────────────────────────────────────────────

export async function normalClick(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.click({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    return true;
  } catch (e) {
    console.warn(`[normal_click] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 2: Scroll into view then click ─────────────────────────────────

export async function scrollThenClick(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.scrollIntoViewIfNeeded({
      timeout: ctx.timeout ?? DEFAULT_TIMEOUT,
    });
    await ctx.locator.click({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    return true;
  } catch (e) {
    console.warn(`[scroll_then_click] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 3: Force click (bypasses visibility check) ─────────────────────

export async function forceClick(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.click({
      force: true,
      timeout: ctx.timeout ?? DEFAULT_TIMEOUT,
    });
    return true;
  } catch (e) {
    console.warn(`[force_click] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 4: Hover then click ────────────────────────────────────────────

export async function hoverThenClick(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.hover({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    await ctx.page.waitForTimeout(300); // Let CSS transitions settle
    await ctx.locator.click({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    return true;
  } catch (e) {
    console.warn(`[hover_then_click] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 5: Keyboard Enter ──────────────────────────────────────────────

export async function keyboardEnter(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.focus({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    await ctx.page.keyboard.press("Enter");
    return true;
  } catch (e) {
    console.warn(`[keyboard_enter] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 6: JavaScript click ────────────────────────────────────────────
// Most aggressive DOM-level click — bypasses ALL Playwright checks.
// Works even when element is hidden, covered, or pointer-events: none.

export async function jsClick(ctx: RecoveryContext): Promise<boolean> {
  try {
    // Check element exists first — locator.evaluate waits indefinitely if not found
    const count = await ctx.locator.count();
    if (count === 0) {
      console.warn(`[js_click] element not found in DOM for ${ctx.stepName}`);
      return false;
    }

    await ctx.locator.evaluate((el) => {
      (el as HTMLElement).click();
    });
    return true;
  } catch (e) {
    console.warn(`[js_click] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 7: Dismiss overlay then click ──────────────────────────────────
// Looks for common overlay patterns (modals, cookie banners, popups)
// and tries to dismiss them before retrying the click.

export async function dismissOverlayThenClick(
  ctx: RecoveryContext
): Promise<boolean> {
  try {
    // Common dismiss selectors — covers most modal/cookie/popup patterns
    const dismissSelectors = [
      "button:has-text('Accept')",
      "button:has-text('Close')",
      "button:has-text('Dismiss')",
      "button:has-text('Got it')",
      "button:has-text('OK')",
      "button:has-text('No thanks')",
      "[aria-label='Close']",
      "[data-dismiss='modal']",
      ".modal-close",
      ".cookie-accept",
      ".popup-close",
    ];

    for (const sel of dismissSelectors) {
      try {
        const overlay = ctx.page.locator(sel).first();
        const visible = await overlay.isVisible({ timeout: 500 });
        if (visible) {
          await overlay.click({ timeout: 1000 });
          console.log(
            `[dismiss_overlay] Dismissed overlay with: ${sel}`
          );
          await ctx.page.waitForTimeout(300);
          break;
        }
      } catch {
        // This selector didn't match — try next
      }
    }

    // Retry the original click after dismissing
    await ctx.locator.click({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    return true;
  } catch (e) {
    console.warn(
      `[dismiss_overlay_then_click] failed for ${ctx.stepName}: ${e}`
    );
    return false;
  }
}

// ─── Exported ladder (in order) ───────────────────────────────────────────────

// ORDER MATTERS:
//  1. normal_click              — standard, try first
//  2. scroll_then_click         — element off-screen
//  3. dismiss_overlay_then_click — overlay/modal blocking (BEFORE force — dismiss is cleaner)
//  4. hover_then_click          — CSS hover state required
//  5. keyboard_enter            — keyboard-accessible elements
//  6. js_click                  — React/SPA elements that need native dispatch (BEFORE force)
//  7. force_click               — last resort, bypasses all checks
export const CLICK_STRATEGY_LADDER = [
  { name: "normal_click"              as const, fn: normalClick              },
  { name: "scroll_then_click"         as const, fn: scrollThenClick          },
  { name: "dismiss_overlay_then_click"as const, fn: dismissOverlayThenClick  },
  { name: "hover_then_click"          as const, fn: hoverThenClick           },
  { name: "keyboard_enter"            as const, fn: keyboardEnter            },
  { name: "js_click"                  as const, fn: jsClick                  },
  { name: "force_click"               as const, fn: forceClick               },
];