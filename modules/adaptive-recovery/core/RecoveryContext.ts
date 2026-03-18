/**
 * RecoveryContext.ts
 * Holds everything a strategy needs to attempt an action.
 * Passed into every strategy function so they are self-contained.
 */

import { Page, Locator } from "@playwright/test";

export interface RecoveryContext {
  page: Page;
  locator: Locator;
  stepName: string;
  value?: string;       // Only for fill actions
  timeout?: number;     // Per-strategy timeout in ms (default 3000)
}