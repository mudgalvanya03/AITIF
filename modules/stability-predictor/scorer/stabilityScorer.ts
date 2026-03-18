/**
 * stabilityScorer.ts
 *
 * Combines reactive signals (history) and proactive signals (DOM analysis)
 * into a final stability score 0-100 with a risk level and recommendation.
 *
 * SCORING BREAKDOWN:
 *
 *   Reactive score (max 50):
 *     heal_count × 10  (capped at 30) — how often ML had to heal it
 *     recovery_count × 10 (capped at 20) — how often adaptive recovery ran
 *     full_drift_count × 5 — worst breakage type hit it
 *
 *   Proactive score (max 50):
 *     no data-test attr  +15 — missing the most stable identifier
 *     no ID              +10 — no stable anchor
 *     class_count > 3    +8  — too many volatile classes
 *     depth > 8          +8  — deep DOM is fragile
 *     text_length > 30   +5  — long text content changes
 *     is_positional      +4  — positional = breaks on reorder
 *
 *   Risk levels:
 *     0-25:   STABLE   — solid, no action needed
 *     26-50:  WATCH    — some signals, monitor it
 *     51-75:  FRAGILE  — likely to break, consider fixing
 *     76-100: CRITICAL — will break, fix now
 */

import {
  ReactiveSignals,
  ProactiveSignals,
  StabilityScore,
  RiskLevel,
} from "../core/StabilityTypes";

// ─── Reactive scoring ─────────────────────────────────────────────────────────

function scoreReactive(signals: ReactiveSignals): number {
  let score = 0;

  // Heal frequency — capped at 30
  score += Math.min(signals.healCount * 10, 30);

  // Recovery frequency — capped at 20
  score += Math.min(signals.recoveryCount * 10, 20);

  // Full drift hits — extra penalty for worst-case breakage
  score += Math.min(signals.fullDriftCount * 5, 10);

  return Math.min(score, 50);
}

// ─── Proactive scoring ────────────────────────────────────────────────────────

function scoreProactive(signals: ProactiveSignals): number {
  let score = 0;

  // Missing stable test attribute (data-test, data-testid etc)
  if (!signals.hasDataTest) score += 15;

  // Missing ID
  if (!signals.hasId) score += 10;

  // Too many CSS classes
  if (signals.classCount > 3) score += 8;

  // Deep in DOM tree
  if (signals.domDepth > 8) score += 8;

  // Long text content
  if (signals.textLength > 30) score += 5;

  // Positional locator (relies on nth-child / order)
  if (signals.isPositional) score += 4;

  return Math.min(score, 50);
}

// ─── Risk level ───────────────────────────────────────────────────────────────

function getRiskLevel(totalScore: number): RiskLevel {
  if (totalScore <= 25) return "STABLE";
  if (totalScore <= 50) return "WATCH";
  if (totalScore <= 75) return "FRAGILE";
  return "CRITICAL";
}

// ─── Recommendation ───────────────────────────────────────────────────────────

function getRecommendation(
  score: StabilityScore
): string {
  const { riskLevel, reactiveSignals, proactiveSignals } = score;

  if (riskLevel === "STABLE") {
    return "No action needed. Locator is stable.";
  }

  const reasons: string[] = [];

  // Reactive reasons
  if (reactiveSignals.healCount >= 3) {
    reasons.push(`healed ${reactiveSignals.healCount} times by ML`);
  }
  if (reactiveSignals.recoveryCount >= 2) {
    reasons.push(`needed ${reactiveSignals.recoveryCount} adaptive recovery workarounds`);
  }
  if (reactiveSignals.fullDriftCount > 0) {
    reasons.push(`suffered full attribute drift ${reactiveSignals.fullDriftCount} times`);
  }

  // Proactive reasons
  if (!proactiveSignals.hasDataTest && !proactiveSignals.hasId) {
    reasons.push("has no stable identifier (no data-test, no ID)");
  } else if (!proactiveSignals.hasDataTest) {
    reasons.push("missing data-test attribute");
  }
  if (proactiveSignals.classCount > 3) {
    reasons.push(`relies on ${proactiveSignals.classCount} CSS classes`);
  }
  if (proactiveSignals.domDepth > 8) {
    reasons.push(`sits ${proactiveSignals.domDepth} levels deep in the DOM`);
  }
  if (proactiveSignals.isPositional) {
    reasons.push("uses positional selection (breaks on reorder)");
  }

  const reasonStr = reasons.length > 0
    ? ` Reasons: ${reasons.join(", ")}.`
    : "";

  if (riskLevel === "WATCH") {
    return `Monitor this locator.${reasonStr} Consider adding a data-test attribute.`;
  }
  if (riskLevel === "FRAGILE") {
    return `Refactor recommended.${reasonStr} Add data-test attribute and reduce class dependencies.`;
  }
  // CRITICAL
  return `Fix urgently.${reasonStr} This locator will break. Add a stable data-test attribute immediately.`;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreLocator(
  stepName: string,
  reactive: ReactiveSignals,
  proactive: ProactiveSignals
): StabilityScore {
  const reactiveScore  = scoreReactive(reactive);
  const proactiveScore = scoreProactive(proactive);
  const totalScore     = reactiveScore + proactiveScore;
  const riskLevel      = getRiskLevel(totalScore);

  const partial: StabilityScore = {
    stepName,
    reactiveScore,
    proactiveScore,
    totalScore,
    riskLevel,
    reactiveSignals: reactive,
    proactiveSignals: proactive,
    recommendation: "",
  };

  partial.recommendation = getRecommendation(partial);

  return partial;
}

// ─── Default signals (for locators with no history) ───────────────────────────

export function defaultReactiveSignals(stepName: string): ReactiveSignals {
  return {
    stepName,
    healCount: 0,
    recoveryCount: 0,
    fullDriftCount: 0,
    strategiesFailed: 0,
    lastHealed: null,
  };
}

export function defaultProactiveSignals(stepName: string): ProactiveSignals {
  return {
    stepName,
    hasId: false,
    hasDataTest: false,
    classCount: 0,
    domDepth: 0,
    textLength: 0,
    siblingCount: 0,
    isPositional: false,
    tag: "unknown",
  };
}