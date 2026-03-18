/**
 * ActionResult.ts
 * Core types for the adaptive recovery module.
 * Every strategy attempt is recorded as a StrategyResult.
 * The full RecoveryLog is saved to disk for genai-summary to read later.
 */

export type ActionType = "click" | "fill" | "select" | "navigate";

export type StrategyName =
  // Click strategies
  | "normal_click"
  | "force_click"
  | "scroll_then_click"
  | "keyboard_enter"
  | "js_click"
  | "dismiss_overlay_then_click"
  | "hover_then_click"
  // Fill strategies
  | "normal_fill"
  | "clear_then_fill"
  | "slow_type"
  | "js_value_set"
  | "clipboard_paste"
  // Navigation fallback
  | "direct_url_navigation";

export interface StrategyResult {
  strategy: StrategyName;
  success: boolean;
  error?: string;         // Error message if it failed
  durationMs: number;     // How long this attempt took
  timestamp: string;
}

export interface RecoveryLog {
  stepName: string;
  actionType: ActionType;
  value?: string;         // For fill actions — what was being typed
  attempts: StrategyResult[];
  finalStrategy: StrategyName | null;  // Which strategy ultimately worked
  recovered: boolean;     // Did any strategy succeed?
  totalDurationMs: number;
  timestamp: string;
}