/**
 * fillStrategies.ts
 *
 * The fill strategy ladder — tried in order from least to most aggressive.
 * Covers cases where normal fill() fails due to React controlled inputs,
 * readonly attributes, custom input components, or event listener issues.
 *
 * ORDER:
 *   1. normal_fill       — standard Playwright fill()
 *   2. clear_then_fill   — triple-click to select all, then type
 *   3. slow_type         — type character by character (triggers keydown events)
 *   4. js_value_set      — set value via JS + dispatch input/change events
 *   5. clipboard_paste   — write to clipboard and paste
 */

import { RecoveryContext } from "../core/RecoveryContext";


const DEFAULT_TIMEOUT = 3000;

// ─── Strategy 1: Normal fill ──────────────────────────────────────────────────

export async function normalFill(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.fill(ctx.value ?? "", {
      timeout: ctx.timeout ?? DEFAULT_TIMEOUT,
    });
    return true;
  } catch (e) {
    console.warn(`[normal_fill] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 2: Clear then fill ─────────────────────────────────────────────
// Triple-click selects all existing text, then type replaces it.
// Works for inputs that reject fill() but accept keyboard input.

export async function clearThenFill(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.click({
      clickCount: 3,
      timeout: ctx.timeout ?? DEFAULT_TIMEOUT,
    });
    await ctx.locator.type(ctx.value ?? "", { delay: 20 });
    return true;
  } catch (e) {
    console.warn(`[clear_then_fill] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 3: Slow type (character by character) ──────────────────────────
// Fires individual keydown/keypress/keyup events per character.
// Required for inputs with character-level validation or masking.

export async function slowType(ctx: RecoveryContext): Promise<boolean> {
  try {
    // Temporarily remove readonly if present so typing works
    await ctx.locator.evaluate((el) => {
      (el as HTMLInputElement).removeAttribute("readonly");
      (el as HTMLInputElement).value = "";
    });

    await ctx.locator.focus({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    await ctx.locator.type(ctx.value ?? "", { delay: 50 });

    // Verify value was actually set
    const actual = await ctx.locator.inputValue();
    if (actual !== ctx.value) return false;

    return true;
  } catch (e) {
    console.warn(`[slow_type] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 4: JavaScript value set + dispatch events ──────────────────────
// Directly sets the value property and fires input + change events.
// Works for React controlled inputs where fill() doesn't trigger re-render.

export async function jsValueSet(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.locator.evaluate((el, val) => {
      const input = el as HTMLInputElement;

      // React uses a custom value setter — we need to trigger it
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, val);
      } else {
        input.value = val;
      }

      // Fire all events React/Vue/Angular listen to
      input.dispatchEvent(new Event("input",  { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown",  { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup",    { bubbles: true }));
      input.dispatchEvent(new Event("blur",   { bubbles: true }));
    }, ctx.value ?? "");

    // Small wait for React to process the synthetic events
    await ctx.page.waitForTimeout(100);

    return true;
  } catch (e) {
    console.warn(`[js_value_set] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Strategy 5: Clipboard paste ─────────────────────────────────────────────
// Writes value to clipboard and pastes it.
// Last resort for inputs that block programmatic input entirely.

export async function clipboardPaste(ctx: RecoveryContext): Promise<boolean> {
  try {
    await ctx.page.evaluate((val) => {
      navigator.clipboard.writeText(val);
    }, ctx.value ?? "");

    await ctx.locator.focus({ timeout: ctx.timeout ?? DEFAULT_TIMEOUT });
    await ctx.locator.evaluate((el) => {
      (el as HTMLInputElement).value = "";
    });

    const isMac = process.platform === "darwin";
    await ctx.page.keyboard.press(isMac ? "Meta+v" : "Control+v");

    return true;
  } catch (e) {
    console.warn(`[clipboard_paste] failed for ${ctx.stepName}: ${e}`);
    return false;
  }
}

// ─── Exported ladder (in order) ───────────────────────────────────────────────

// ORDER MATTERS for React apps:
//  1. normal_fill    — standard Playwright, works for most inputs
//  2. js_value_set   — React native setter trick (BEFORE keyboard strategies)
//                      keyboard strategies type chars but don't update React state
//  3. clear_then_fill — triple-click + type (non-React inputs)
//  4. slow_type       — char-by-char (masked/validated inputs)
//  5. clipboard_paste — last resort
export const FILL_STRATEGY_LADDER = [
  { name: "normal_fill"     as const, fn: normalFill     },
  { name: "js_value_set"    as const, fn: jsValueSet     },
  { name: "clear_then_fill" as const, fn: clearThenFill  },
  { name: "slow_type"       as const, fn: slowType       },
  { name: "clipboard_paste" as const, fn: clipboardPaste },
];