/**
 * StabilityTypes.ts
 * Core types for the stability predictor module.
 */

export type RiskLevel = "STABLE" | "WATCH" | "FRAGILE" | "CRITICAL";

// ─── Reactive signals (from healing + recovery history) ───────────────────────

export interface ReactiveSignals {
  stepName: string;
  healCount: number;           // How many times this locator was healed by ML
  recoveryCount: number;       // How many times adaptive recovery was needed
  fullDriftCount: number;      // Times the worst mutation (full_drift) hit it
  strategiesFailed: number;    // Avg strategies that failed before recovery
  lastHealed: string | null;   // ISO timestamp of most recent heal
}

// ─── Proactive signals (from current DOM snapshot in locator-store) ───────────

export interface ProactiveSignals {
  stepName: string;
  hasId: boolean;              // Has a stable ID attribute
  hasDataTest: boolean;        // Has data-test / data-cy / data-testid attribute
  classCount: number;          // Number of CSS classes (more = more breakable)
  domDepth: number;            // How deep in the DOM tree
  textLength: number;          // Length of text content (longer = more fragile)
  siblingCount: number;        // Siblings in parent (positional ambiguity)
  isPositional: boolean;       // Relies on nth-child or positional selectors
  tag: string;                 // Element tag
}

// ─── Combined stability score ─────────────────────────────────────────────────

export interface StabilityScore {
  stepName: string;
  reactiveScore: number;       // 0-50 from history
  proactiveScore: number;      // 0-50 from DOM analysis
  totalScore: number;          // 0-100 combined
  riskLevel: RiskLevel;        // STABLE / WATCH / FRAGILE / CRITICAL
  reactiveSignals: ReactiveSignals;
  proactiveSignals: ProactiveSignals;
  recommendation: string;      // Human-readable action to take
}

// ─── Full report ─────────────────────────────────────────────────────────────

export interface StabilityReport {
  generatedAt: string;
  totalLocators: number;
  summary: {
    stable: number;
    watch: number;
    fragile: number;
    critical: number;
  };
  scores: StabilityScore[];    // All locators sorted by totalScore desc
  topRisks: StabilityScore[];  // Top 5 most at-risk locators
}