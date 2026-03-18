/**
 * diverseDataset.spec.ts
 *
 * PURPOSE:
 *   Generate a high-quality, balanced ML training dataset for the AITIF
 *   locator healing model — specifically targeting the cases where the
 *   heuristic scorer FAILS (score < 40) and ML must take over.
 *
 * WHY THE OLD DATASET FAILED:
 *   1. Class imbalance: 1 positive vs N-1 negatives per step → model always predicts 0
 *   2. Only "easy" cases were collected → ML never saw hard partial-match scenarios
 *   3. Feature vectors were mostly 0/1 extremes → model had nothing to learn from
 *
 * THIS SCRIPT'S STRATEGY:
 *   - Injects DOM mutations (class renames, ID removals, attribute drift) to
 *     simulate exactly the conditions that cause the heuristic to fail (score < 40)
 *   - For every positive example (chosen=1), explicitly creates HARD negatives
 *     that are similar-but-wrong (chosen=0) — producing non-trivial feature values
 *     in the 0.2–0.8 range across ALL 10 features
 *   - Enforces controlled label balance (~1 positive : 2 hard negatives per step)
 *   - Covers: buttons, inputs, links, selects, checkboxes, text, icon elements
 *   - Uses real sites + synthetic pages to fill every gap in the feature space
 *
 * FEATURE COVERAGE TARGETS:
 *   tagMatch          → always 1 (same-tag candidates only)
 *   idMatch           → covered by ID removal mutations + ID collision cases
 *   classOverlap      → covered by partial class rename mutations
 *   attributeOverlap  → covered by attr drift mutations + attribute-only elements
 *   textMatch         → covered by similar-text button/link cases
 *   textSimilarity    → covered by Levenshtein-close text variants
 *   semanticSimilarity→ covered by semantic anchor/button text cases
 *   parentMatch       → covered by parent-tag diversity synthetic test
 *   depthDiff         → covered by deep nesting test
 *   siblingDensity    → covered by sibling density variation test
 *
 * OUTPUT: data/ml-dataset/healing-data.json  (consumed by exportDataset.ts → dataset.csv)
 */

import { test, Page } from "@playwright/test";
import { extractFeatures } from "../../modules/locator-recovery/ml/featureExtractor";
import { logFeatureVector } from "../../modules/locator-recovery/ml/featureLogger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElementMeta {
  tag: string;
  id: string | null;
  classes: string[];
  text: string | null;
  attributes: Record<string, string>;
  parentTag?: string | null;
  depth?: number;
  siblingCount?: number;
}

interface OriginalMeta extends ElementMeta {
  stepName: string;
  timestamp: string;
}

// ─── Mutation types ───────────────────────────────────────────────────────────
// These simulate the exact DOM changes that cause heuristic score to drop < 40,
// which is the threshold that triggers ML fallback in healingExecutor.ts

type MutationType =
  | "id_removed"       // Dev removes ID — heuristic loses 30 pts
  | "class_renamed"    // Classes get version suffix — partial overlap
  | "attr_changed"     // data-test/name attrs changed — common refactor
  | "id_and_class"     // Both ID and classes gone — only text/type remain
  | "full_drift";      // Maximum drift — only tag/text survive

const ALL_MUTATIONS: MutationType[] = [
  "id_removed",
  "class_renamed",
  "attr_changed",
  "id_and_class",
  "full_drift",
];

// ─── Helper: snapshot a real DOM element ─────────────────────────────────────

async function snapshotElement(
  page: Page,
  selector: string
): Promise<ElementMeta | null> {
  try {
    const el = page.locator(selector).first();
    await el.waitFor({ timeout: 5000 });

    return await el.evaluate((node) => {
      const attrs: Record<string, string> = {};
      Array.from(node.attributes).forEach((a) => (attrs[a.name] = a.value));

      function getDepth(e: Element): number {
        let d = 0;
        let cur: Element | null = e;
        while (cur?.parentElement) {
          d++;
          cur = cur.parentElement;
        }
        return d;
      }

      return {
        tag: node.tagName.toLowerCase(),
        id: (node as HTMLElement).id || null,
        classes: node.className
          ? node.className.split(" ").filter(Boolean)
          : [],
        text: node.textContent?.trim() || null,
        attributes: attrs,
        parentTag: node.parentElement?.tagName.toLowerCase() || null,
        depth: getDepth(node),
        siblingCount: node.parentElement?.children.length || 0,
      };
    });
  } catch {
    return null;
  }
}

// ─── Helper: get ALL same-tag candidates from the page ───────────────────────

async function getAllCandidates(
  page: Page,
  tag: string
): Promise<ElementMeta[]> {
  const locators = await page.locator(tag).all();
  const results: ElementMeta[] = [];

  for (const el of locators) {
    try {
      const meta = await el.evaluate((node) => {
        const attrs: Record<string, string> = {};
        Array.from(node.attributes).forEach((a) => (attrs[a.name] = a.value));

        function getDepth(e: Element): number {
          let d = 0;
          let cur: Element | null = e;
          while (cur?.parentElement) {
            d++;
            cur = cur.parentElement;
          }
          return d;
        }

        return {
          tag: node.tagName.toLowerCase(),
          id: (node as HTMLElement).id || null,
          classes: node.className
            ? node.className.split(" ").filter(Boolean)
            : [],
          text: node.textContent?.trim() || null,
          attributes: attrs,
          parentTag: node.parentElement?.tagName.toLowerCase() || null,
          depth: getDepth(node),
          siblingCount: node.parentElement?.children.length || 0,
        };
      });
      results.push(meta);
    } catch {
      // Stale element — skip
    }
  }

  return results;
}

// ─── Mutation factory ─────────────────────────────────────────────────────────
// Produces a "broken" version of the original metadata.
// These mutations produce heuristic scores < 40, which is exactly when
// the ML model is called in healingExecutor.ts.

function mutateOriginal(
  original: ElementMeta,
  stepName: string,
  mutationType: MutationType
): OriginalMeta {
  const mutated: OriginalMeta = {
    ...JSON.parse(JSON.stringify(original)),
    stepName: `${stepName}_${mutationType}`,
    timestamp: new Date().toISOString(),
  };

  switch (mutationType) {
    case "id_removed":
      // Most common: dev removes or changes the element's ID
      // Heuristic: loses 30 pts → likely < 40 total
      mutated.id = null;
      delete mutated.attributes["id"];
      break;

    case "class_renamed":
      // Classes get refactored with version suffix (e.g. btn-primary → btn-primary-v2)
      // Results in partial classOverlap (0.3–0.7) — the exact range model must learn
      mutated.id = null;
      mutated.classes = original.classes.map((c) =>
        // Rename ~half the classes to simulate partial migration
        c.length > 4 ? `${c}-v2` : c
      );
      mutated.attributes = { ...mutated.attributes };
      if (mutated.attributes.class) {
        mutated.attributes.class = mutated.classes.join(" ");
      }
      break;

    case "attr_changed":
      // data-test / name attributes changed — very common in component refactors
      // ID and classes stripped too → heuristic score near 0
      mutated.id = null;
      mutated.classes = [];
      const newAttrs: Record<string, string> = {};
      Object.entries(original.attributes).forEach(([k, v]) => {
        if (["data-test", "name", "data-id", "data-cy"].includes(k)) {
          newAttrs[k] = `${v}-updated`; // Changed value
        } else if (!["id", "class"].includes(k)) {
          newAttrs[k] = v; // Keep stable attrs: type, placeholder, aria-label
        }
      });
      mutated.attributes = newAttrs;
      break;

    case "id_and_class":
      // Both ID and classes gone — component was rewritten
      // Only text content, type, and placeholder remain as signals
      mutated.id = null;
      mutated.classes = [];
      const strippedAttrs: Record<string, string> = {};
      Object.entries(original.attributes).forEach(([k, v]) => {
        if (!["id", "class", "data-test", "name", "data-id"].includes(k)) {
          strippedAttrs[k] = v; // Keep: type, placeholder, aria-label, value
        }
      });
      mutated.attributes = strippedAttrs;
      break;

    case "full_drift":
      // Maximum breakage: all identifiers gone, only tag + text content survive
      // This is the hardest case — model must rely on textSimilarity and semanticSimilarity
      mutated.id = null;
      mutated.classes = [];
      mutated.attributes = original.attributes.type
        ? { type: original.attributes.type }
        : {};
      break;
  }

  return mutated;
}

// ─── Find correct candidate index ────────────────────────────────────────────
// Identifies which candidate in the list matches the original element

function findCorrectIndex(
  original: ElementMeta,
  candidates: ElementMeta[]
): number {
  // Strategy 1: Exact ID match
  if (original.id) {
    const idx = candidates.findIndex((c) => c.id === original.id);
    if (idx >= 0) return idx;
  }

  // Strategy 2: Exact text + exact class set match
  if (original.text) {
    const idx = candidates.findIndex(
      (c) =>
        c.text === original.text &&
        c.tag === original.tag &&
        JSON.stringify(c.classes.sort()) ===
          JSON.stringify(original.classes.sort())
    );
    if (idx >= 0) return idx;
  }

  // Strategy 3: Exact text match (unique text on page)
  if (original.text) {
    const matches = candidates.filter((c) => c.text === original.text);
    if (matches.length === 1) {
      return candidates.indexOf(matches[0]);
    }
  }

  // Strategy 4: Attribute fingerprint (data-test, name, aria-label)
  const fingerprint = ["data-test", "name", "aria-label", "placeholder", "data-index"]
    .map((k) => original.attributes[k])
    .filter(Boolean)
    .join("|");

  if (fingerprint) {
    const idx = candidates.findIndex((c) => {
      const cf = ["data-test", "name", "aria-label", "placeholder", "data-index"]
        .map((k) => c.attributes[k])
        .filter(Boolean)
        .join("|");
      return cf === fingerprint;
    });
    if (idx >= 0) return idx;
  }

  // Fallback: first candidate (rare)
  return 0;
}

// ─── Select hard negatives ────────────────────────────────────────────────────
// Picks the most confusable wrong candidates — these train the model to
// distinguish between similar-but-wrong elements

function selectHardNegatives(
  original: ElementMeta,
  candidates: ElementMeta[],
  correctIndex: number,
  maxNegatives: number = 2
): ElementMeta[] {
  return candidates
    .filter((_, i) => i !== correctIndex)
    .map((c) => {
      // Score by similarity — hardest negatives have most overlap with original
      const classScore = original.classes.filter((cls) =>
        c.classes.includes(cls)
      ).length;
      const attrScore = Object.keys(original.attributes).filter(
        (k) => c.attributes[k] === original.attributes[k]
      ).length;
      const textScore =
        original.text && c.text && original.text !== c.text ? 1 : 0;
      return { candidate: c, score: classScore * 2 + attrScore + textScore };
    })
    .sort((a, b) => b.score - a.score) // Hardest first
    .slice(0, maxNegatives)
    .map((x) => x.candidate);
}

// ─── CORE: collectElement ─────────────────────────────────────────────────────
//
// For each target element:
//   1. Snapshot the real element (ground truth)
//   2. For each of 5 mutation types, produce a "broken" original metadata
//   3. Against all same-tag candidates on the page, log:
//      - chosen=1 for the correct element
//      - chosen=0 for 2 hard negatives (similar-but-wrong)
//
// Result: 5 mutations × 3 pairs = 15 training records per element
// Label ratio: 5 positive : 10 negative = 1:2 (well-balanced)

async function collectElement(
  page: Page,
  stepName: string,
  selector: string,
  mutations: MutationType[] = ALL_MUTATIONS
) {
  const original = await snapshotElement(page, selector);
  if (!original) {
    console.warn(`[SKIP] Not found: ${stepName} (${selector})`);
    return;
  }

  const candidates = await getAllCandidates(page, original.tag);
  if (candidates.length === 0) {
    console.warn(`[SKIP] No candidates for tag <${original.tag}>: ${stepName}`);
    return;
  }

  const correctIndex = findCorrectIndex(original, candidates);
  const correctCandidate = candidates[correctIndex];
  const hardNegatives = selectHardNegatives(original, candidates, correctIndex, 2);

  for (const mutationType of mutations) {
    const mutated = mutateOriginal(original, stepName, mutationType);

    // ── Positive: the correct element ──
    const positiveFeatures = await extractFeatures(
      mutated.stepName,
      mutated,
      correctCandidate
    );
    await logFeatureVector({
      stepName: mutated.stepName,
      features: positiveFeatures,
      chosen: true,
      timestamp: new Date().toISOString(),
    });

    // ── Hard negatives: similar-but-wrong ──
    for (const neg of hardNegatives) {
      const negFeatures = await extractFeatures(
        mutated.stepName,
        mutated,
        neg
      );
      await logFeatureVector({
        stepName: mutated.stepName,
        features: negFeatures,
        chosen: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(
    `[OK] ${stepName} → ${candidates.length} candidates, ` +
    `${mutations.length} mutations, ` +
    `${mutations.length * (1 + hardNegatives.length)} records logged`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  REAL SITES
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// SITE 1 — Saucedemo
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Saucedemo – Login", () => {
  test("login page elements", async ({ page }) => {
    await page.goto("https://www.saucedemo.com", { waitUntil: "domcontentloaded" });

    await collectElement(page, "username_input",  "#user-name");
    await collectElement(page, "password_input",  "#password");
    await collectElement(page, "login_button",    "#login-button");
    await collectElement(page, "login_logo",      ".login_logo");
  });
});

test.describe("Saucedemo – Inventory", () => {
  test("inventory page elements", async ({ page }) => {
    await page.goto("https://www.saucedemo.com");
    await page.fill("#user-name", "standard_user");
    await page.fill("#password", "secret_sauce");
    await page.click("#login-button");
    await page.waitForURL("**/inventory.html");

    await collectElement(page, "menu_button",            "#react-burger-menu-btn");
    await collectElement(page, "shopping_cart_link",     ".shopping_cart_link");
    await collectElement(page, "inventory_title",        ".title");
    await collectElement(page, "sort_dropdown",          ".product_sort_container");
    await collectElement(page, "add_backpack",           "[data-test='add-to-cart-sauce-labs-backpack']");
    await collectElement(page, "add_bike_light",         "[data-test='add-to-cart-sauce-labs-bike-light']");
    await collectElement(page, "add_bolt_shirt",         "[data-test='add-to-cart-sauce-labs-bolt-t-shirt']");
    await collectElement(page, "add_fleece_jacket",      "[data-test='add-to-cart-sauce-labs-fleece-jacket']");
    await collectElement(page, "item_backpack_title",    ".inventory_item_name >> nth=0");
    await collectElement(page, "item_bike_light_title",  ".inventory_item_name >> nth=1");
    await collectElement(page, "item_price_first",       ".inventory_item_price >> nth=0");
    await collectElement(page, "item_price_second",      ".inventory_item_price >> nth=1");
    await collectElement(page, "inventory_container",    ".inventory_container");
  });
});

test.describe("Saucedemo – Cart", () => {
  test("cart page elements", async ({ page }) => {
    await page.goto("https://www.saucedemo.com");
    await page.fill("#user-name", "standard_user");
    await page.fill("#password", "secret_sauce");
    await page.click("#login-button");
    await page.waitForURL("**/inventory.html");
    await page.click("[data-test='add-to-cart-sauce-labs-backpack']");
    await page.click("[data-test='add-to-cart-sauce-labs-bike-light']");
    await page.click(".shopping_cart_link");
    await page.waitForURL("**/cart.html");

    await collectElement(page, "cart_title",         ".title");
    await collectElement(page, "checkout_button",    "[data-test='checkout']");
    await collectElement(page, "continue_shopping",  "[data-test='continue-shopping']");
    await collectElement(page, "cart_item_name",     ".inventory_item_name");
    await collectElement(page, "cart_item_price",    ".inventory_item_price");
    await collectElement(page, "remove_backpack",    "[data-test='remove-sauce-labs-backpack']");
    await collectElement(page, "cart_quantity",      ".cart_quantity");
  });
});

test.describe("Saucedemo – Checkout", () => {
  test("checkout step one", async ({ page }) => {
    await page.goto("https://www.saucedemo.com");
    await page.fill("#user-name", "standard_user");
    await page.fill("#password", "secret_sauce");
    await page.click("#login-button");
    await page.waitForURL("**/inventory.html");
    await page.click("[data-test='add-to-cart-sauce-labs-backpack']");
    await page.click(".shopping_cart_link");
    await page.click("[data-test='checkout']");
    await page.waitForURL("**/checkout-step-one.html");

    await collectElement(page, "checkout_firstname",    "[data-test='firstName']");
    await collectElement(page, "checkout_lastname",     "[data-test='lastName']");
    await collectElement(page, "checkout_postal",       "[data-test='postalCode']");
    await collectElement(page, "checkout_continue_btn", "[data-test='continue']");
    await collectElement(page, "checkout_cancel_btn",   "[data-test='cancel']");
  });

  test("checkout step two", async ({ page }) => {
    await page.goto("https://www.saucedemo.com");
    await page.fill("#user-name", "standard_user");
    await page.fill("#password", "secret_sauce");
    await page.click("#login-button");
    await page.waitForURL("**/inventory.html");
    await page.click("[data-test='add-to-cart-sauce-labs-backpack']");
    await page.click(".shopping_cart_link");
    await page.click("[data-test='checkout']");
    await page.fill("[data-test='firstName']", "Test");
    await page.fill("[data-test='lastName']", "User");
    await page.fill("[data-test='postalCode']", "12345");
    await page.click("[data-test='continue']");
    await page.waitForURL("**/checkout-step-two.html");

    await collectElement(page, "checkout_finish_btn",   "[data-test='finish']");
    await collectElement(page, "checkout_cancel_2",     "[data-test='cancel']");
    await collectElement(page, "checkout_total_label",  ".summary_total_label");
    await collectElement(page, "checkout_item_label",   ".summary_info_label >> nth=0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE 2 — DemoQA
// ─────────────────────────────────────────────────────────────────────────────

test.describe("DemoQA – Text Box", () => {
  test("text inputs", async ({ page }) => {
    await page.goto("https://demoqa.com/text-box", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_fullname",      "#userName");
    await collectElement(page, "demoqa_email",         "#userEmail");
    await collectElement(page, "demoqa_current_addr",  "#currentAddress");
    await collectElement(page, "demoqa_perm_addr",     "#permanentAddress");
    await collectElement(page, "demoqa_submit",        "#submit");
  });
});

test.describe("DemoQA – Checkbox", () => {
  test("checkbox elements", async ({ page }) => {
    await page.goto("https://demoqa.com/checkbox", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_expand_all",    "button[title='Expand all']");
    await collectElement(page, "demoqa_collapse_all",  "button[title='Collapse all']");

    await page.click("button[title='Expand all']");
    await page.waitForTimeout(500);
    await collectElement(page, "demoqa_home_checkbox", ".rct-checkbox >> nth=0");
    await collectElement(page, "demoqa_leaf_check_1",  ".rct-node-leaf >> nth=0");
    await collectElement(page, "demoqa_leaf_check_2",  ".rct-node-leaf >> nth=1");
  });
});

test.describe("DemoQA – Radio", () => {
  test("radio buttons", async ({ page }) => {
    await page.goto("https://demoqa.com/radio-button", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_yes_radio",         "label[for='yesRadio']");
    await collectElement(page, "demoqa_impressive_radio",  "label[for='impressiveRadio']");
    await collectElement(page, "demoqa_no_radio",          "label[for='noRadio']");
  });
});

test.describe("DemoQA – Web Tables", () => {
  test("table + form elements", async ({ page }) => {
    await page.goto("https://demoqa.com/webtables", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_add_btn",         "#addNewRecordButton");
    await collectElement(page, "demoqa_search_box",      "#searchBox");
    await collectElement(page, "demoqa_edit_row_1",      "[title='Edit'] >> nth=0");
    await collectElement(page, "demoqa_delete_row_1",    "[title='Delete'] >> nth=0");
    await collectElement(page, "demoqa_col_header_1",    ".rt-th >> nth=0");

    await page.click("#addNewRecordButton");
    await page.waitForSelector("#firstName");

    await collectElement(page, "demoqa_form_firstname",  "#firstName");
    await collectElement(page, "demoqa_form_lastname",   "#lastName");
    await collectElement(page, "demoqa_form_email",      "#userEmail");
    await collectElement(page, "demoqa_form_age",        "#age");
    await collectElement(page, "demoqa_form_salary",     "#salary");
    await collectElement(page, "demoqa_form_dept",       "#department");
    await collectElement(page, "demoqa_form_submit",     "#submit");
  });
});

test.describe("DemoQA – Buttons", () => {
  test("click button types", async ({ page }) => {
    await page.goto("https://demoqa.com/buttons", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_double_click_btn", "#doubleClickBtn");
    await collectElement(page, "demoqa_right_click_btn",  "#rightClickBtn");
    await collectElement(page, "demoqa_click_me_btn",     "button:has-text('Click Me') >> nth=2");
  });
});

test.describe("DemoQA – Select Menu", () => {
  test("select inputs", async ({ page }) => {
    await page.goto("https://demoqa.com/select-menu", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_select_value",    "#withOptGroup");
    await collectElement(page, "demoqa_select_one",      "#selectOne");
    await collectElement(page, "demoqa_old_select",      "#oldSelectMenu");
    await collectElement(page, "demoqa_multiselect",     "#cars");
  });
});

test.describe("DemoQA – Links", () => {
  test("link elements", async ({ page }) => {
    await page.goto("https://demoqa.com/links", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_simple_link",     "#simpleLink");
    await collectElement(page, "demoqa_dynamic_link",    "#dynamicLink");
    await collectElement(page, "demoqa_created_link",    "#created");
    await collectElement(page, "demoqa_moved_link",      "#moved");
  });
});

test.describe("DemoQA – Upload Download", () => {
  test("file elements", async ({ page }) => {
    await page.goto("https://demoqa.com/upload-download", { waitUntil: "domcontentloaded" });

    await collectElement(page, "demoqa_download_btn",  "#downloadButton");
    await collectElement(page, "demoqa_upload_input",  "#uploadFile");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE 3 — The Internet (Heroku)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Herokuapp – Login", () => {
  test("login form", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/login", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_username",     "#username");
    await collectElement(page, "herokuapp_password",     "#password");
    await collectElement(page, "herokuapp_login_btn",    "button[type='submit']");
    await collectElement(page, "herokuapp_page_h2",      "h2");
  });

  test("post-login elements", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/login");
    await page.fill("#username", "tomsmith");
    await page.fill("#password", "SuperSecretPassword!");
    await page.click("button[type='submit']");

    await collectElement(page, "herokuapp_logout_btn",   ".button.secondary");
    await collectElement(page, "herokuapp_flash_msg",    "#flash");
    await collectElement(page, "herokuapp_flash_close",  ".flash .close");
  });
});

test.describe("Herokuapp – Dropdown", () => {
  test("select element", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/dropdown", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_dropdown",   "#dropdown");
    await collectElement(page, "herokuapp_option_1",   "option[value='1']");
    await collectElement(page, "herokuapp_option_2",   "option[value='2']");
  });
});

test.describe("Herokuapp – Checkboxes", () => {
  test("checkbox inputs", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/checkboxes", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_checkbox_1",   "input[type='checkbox'] >> nth=0");
    await collectElement(page, "herokuapp_checkbox_2",   "input[type='checkbox'] >> nth=1");
  });
});

test.describe("Herokuapp – Dynamic Controls", () => {
  // KEY: element appears/disappears — ID may change. ML must rely on other features.
  test("dynamic element lifecycle", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/dynamic_controls", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_checkbox_dyn", "#checkbox");
    await collectElement(page, "herokuapp_remove_btn",   "button:has-text('Remove')");
    await collectElement(page, "herokuapp_enable_btn",   "button:has-text('Enable')");
    await collectElement(page, "herokuapp_input_dyn",    "#input-example input");

    await page.click("button:has-text('Remove')");
    await page.waitForSelector("#message", { timeout: 8000 });

    await collectElement(page, "herokuapp_add_btn",      "button:has-text('Add')");
    await collectElement(page, "herokuapp_result_msg",   "#message");
  });
});

test.describe("Herokuapp – Add Remove Elements", () => {
  // Multiple identical-looking delete buttons — hardest negative case
  test("dynamic identical elements", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/add_remove_elements/", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_add_element",  "button:has-text('Add Element')");

    for (let i = 0; i < 4; i++) {
      await page.click("button:has-text('Add Element')");
    }

    // 4 identical delete buttons — model must distinguish by depth/sibling/parent
    await collectElement(page, "herokuapp_delete_1",     ".added-manually >> nth=0");
    await collectElement(page, "herokuapp_delete_2",     ".added-manually >> nth=1");
    await collectElement(page, "herokuapp_delete_3",     ".added-manually >> nth=2");
    await collectElement(page, "herokuapp_delete_4",     ".added-manually >> nth=3");
  });
});

test.describe("Herokuapp – Tables", () => {
  test("table cells and headers", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/tables", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_table1",          "#table1");
    await collectElement(page, "herokuapp_table2",          "#table2");
    await collectElement(page, "herokuapp_t1_header_last",  "#table1 th:last-child");
    await collectElement(page, "herokuapp_t1_row1_cell1",   "#table1 tbody tr:first-child td:first-child");
    await collectElement(page, "herokuapp_t1_edit_link",    "#table1 tbody tr:first-child .edit");
    await collectElement(page, "herokuapp_t1_delete_link",  "#table1 tbody tr:first-child .delete");
  });
});

test.describe("Herokuapp – Key Presses", () => {
  test("keypress input", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/key_presses", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_key_input",   "#target");
    await collectElement(page, "herokuapp_key_result",  "#result");
  });
});

test.describe("Herokuapp – Inputs", () => {
  test("number input", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/inputs", { waitUntil: "domcontentloaded" });
    await collectElement(page, "herokuapp_number_input", "input[type='number']");
  });
});

test.describe("Herokuapp – Hovers", () => {
  test("hover reveal elements", async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/hovers", { waitUntil: "domcontentloaded" });

    await collectElement(page, "herokuapp_figure_1",    ".figure >> nth=0");
    await collectElement(page, "herokuapp_figure_2",    ".figure >> nth=1");
    await collectElement(page, "herokuapp_figure_3",    ".figure >> nth=2");

    await page.hover(".figure >> nth=0");
    await page.waitForTimeout(300);
    await collectElement(page, "herokuapp_hover_link_1",".figure:nth-child(1) .figcaption a");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE 4 — TodoMVC (no IDs on items — pure text + semantic healing)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("TodoMVC – Dynamic List", () => {
  test("todo items", async ({ page }) => {
    await page.goto("https://demo.playwright.dev/todomvc", { waitUntil: "domcontentloaded" });

    await collectElement(page, "todo_new_input", ".new-todo");

    const todos = [
      "Buy groceries",
      "Walk the dog",
      "Read a book",
      "Write unit tests",
      "Fix broken locators",
      "Deploy to staging",
    ];
    for (const t of todos) {
      await page.fill(".new-todo", t);
      await page.keyboard.press("Enter");
    }

    // No IDs on list items — textSimilarity + semanticSimilarity must work
    await collectElement(page, "todo_buy_groceries",    ".todo-list li >> nth=0");
    await collectElement(page, "todo_walk_dog",         ".todo-list li >> nth=1");
    await collectElement(page, "todo_read_book",        ".todo-list li >> nth=2");
    await collectElement(page, "todo_write_tests",      ".todo-list li >> nth=3");
    await collectElement(page, "todo_fix_locators",     ".todo-list li >> nth=4");
    await collectElement(page, "todo_deploy_staging",   ".todo-list li >> nth=5");

    // Labels (children of li — different tag, same structure)
    await collectElement(page, "todo_label_groceries",  ".todo-list li:nth-child(1) label");
    await collectElement(page, "todo_label_dog",        ".todo-list li:nth-child(2) label");
    await collectElement(page, "todo_toggle_1",         ".todo-list li:nth-child(1) .toggle");
    await collectElement(page, "todo_item_count",       ".todo-count");

    // Filters — same <a> tag, only text differs: core semantic test
    await collectElement(page, "todo_filter_all",       "a:has-text('All')");
    await collectElement(page, "todo_filter_active",    "a:has-text('Active')");

    await page.click(".todo-list li:nth-child(1) .toggle");
    await page.click(".todo-list li:nth-child(2) .toggle");

    await collectElement(page, "todo_filter_completed", "a:has-text('Completed')");
    await collectElement(page, "todo_clear_completed",  ".clear-completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE 5 — OrangeHRM (enterprise SPA with dynamic class names)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("OrangeHRM – Login", () => {
  test("login form elements", async ({ page }) => {
    await page.goto(
      "https://opensource-demo.orangehrmlive.com/web/index.php/auth/login",
      { waitUntil: "domcontentloaded", timeout: 15000 }
    ).catch(() => {});

    await collectElement(page, "hrm_username",    "input[name='username']");
    await collectElement(page, "hrm_password",    "input[name='password']");
    await collectElement(page, "hrm_login_btn",   "button[type='submit']");
  });

  test("dashboard elements", async ({ page }) => {
    await page.goto(
      "https://opensource-demo.orangehrmlive.com/web/index.php/auth/login",
      { waitUntil: "domcontentloaded", timeout: 15000 }
    ).catch(() => {});

    try {
      await page.fill("input[name='username']", "Admin");
      await page.fill("input[name='password']", "admin123");
      await page.click("button[type='submit']");
      await page.waitForURL("**/dashboard**", { timeout: 10000 });

      await collectElement(page, "hrm_user_dropdown",    ".oxd-userdropdown");
      await collectElement(page, "hrm_search_input",     ".oxd-input >> nth=0");
      await collectElement(page, "hrm_menu_pim",         "a:has-text('PIM')");
      await collectElement(page, "hrm_menu_leave",       "a:has-text('Leave')");
      await collectElement(page, "hrm_menu_time",        "a:has-text('Time')");
      await collectElement(page, "hrm_menu_admin",       "a:has-text('Admin')");
    } catch {
      console.warn("[SKIP] OrangeHRM post-login navigation failed");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE 6 — ExpandTesting
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ExpandTesting – Login", () => {
  test("login page", async ({ page }) => {
    await page.goto("https://practice.expandtesting.com/login", { waitUntil: "domcontentloaded" });

    await collectElement(page, "expand_username",    "#username");
    await collectElement(page, "expand_password",    "#password");
    await collectElement(page, "expand_login_btn",   "button[type='submit']");
    await collectElement(page, "expand_brand",       ".navbar-brand");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SYNTHETIC PAGES — fill every gap in the feature space
//  These inject specific DOM structures that real sites don't reliably provide
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Synthetic – textSimilarity and semanticSimilarity", () => {
  /**
   * GOAL: Non-trivial textSimilarity (0.3–0.8) and semanticSimilarity values.
   * These are the exact features that matter when ID/classes are gone (full_drift).
   * Without these ranges, the model has no gradient to learn from.
   */
  test("similar text buttons", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button data-index="1">Submit Order</button>
        <button data-index="2">Submit Payment</button>
        <button data-index="3">Cancel Order</button>
        <button data-index="4">Confirm Order</button>
        <button data-index="5">Place Order</button>
        <button data-index="6">Reset Form</button>
        <button data-index="7">Clear Form</button>
        <button data-index="8">Save Changes</button>
        <button data-index="9">Discard Changes</button>
        <button data-index="10">Apply Changes</button>
      </body></html>
    `);

    await collectElement(page, "submit_order_btn",    "button[data-index='1']");
    await collectElement(page, "submit_payment_btn",  "button[data-index='2']");
    await collectElement(page, "cancel_order_btn",    "button[data-index='3']");
    await collectElement(page, "confirm_order_btn",   "button[data-index='4']");
    await collectElement(page, "save_changes_btn",    "button[data-index='8']");
    await collectElement(page, "discard_changes_btn", "button[data-index='9']");
  });

  test("similar link text navigation", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <a id="link-home"       href="/home">Home</a>
        <a id="link-products"   href="/products">Products</a>
        <a id="link-cart"       href="/cart">Shopping Cart</a>
        <a id="link-checkout"   href="/checkout">Checkout</a>
        <a id="link-account"    href="/account">My Account</a>
        <a id="link-orders"     href="/orders">My Orders</a>
        <a id="link-wishlist"   href="/wishlist">My Wishlist</a>
        <a id="link-continue"   href="/continue">Continue</a>
        <a id="link-cont-shop"  href="/continue-shopping">Continue Shopping</a>
        <a id="link-cont-pay"   href="/continue-payment">Continue to Payment</a>
      </body></html>
    `);

    await collectElement(page, "nav_home_link",          "#link-home");
    await collectElement(page, "nav_cart_link",          "#link-cart");
    await collectElement(page, "nav_checkout_link",      "#link-checkout");
    await collectElement(page, "nav_account_link",       "#link-account");
    await collectElement(page, "continue_link",          "#link-continue");
    await collectElement(page, "continue_shopping_link", "#link-cont-shop");
    await collectElement(page, "continue_payment_link",  "#link-cont-pay");
  });
});

test.describe("Synthetic – classOverlap gradients", () => {
  /**
   * GOAL: classOverlap at 0.25, 0.5, 0.75, 1.0 across candidates.
   * This ensures the model learns that partial overlap is a useful signal.
   */
  test("partial class overlap migration", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <!-- Target: 4 classes -->
        <button id="target"   class="btn btn-primary btn-large btn-active">Primary Action</button>
        <!-- 3/4 classes match (overlap=0.75) -->
        <button id="close-1"  class="btn btn-primary btn-large btn-disabled">Close Variant</button>
        <!-- 2/4 classes match (overlap=0.5) -->
        <button id="close-2"  class="btn btn-primary btn-small btn-disabled">Small Variant</button>
        <!-- 1/4 classes match (overlap=0.25) -->
        <button id="close-3"  class="btn btn-secondary btn-small btn-outline">Secondary</button>
        <!-- 0/4 classes match (overlap=0.0) -->
        <button id="close-4"  class="action delete danger icon-only">Delete Action</button>
        <!-- Exact match (overlap=1.0, different id) -->
        <button id="clone"    class="btn btn-primary btn-large btn-active">Clone Action</button>
      </body></html>
    `);

    await collectElement(page, "primary_action_btn",   "#target");
    await collectElement(page, "close_variant_1_btn",  "#close-1");
    await collectElement(page, "close_variant_2_btn",  "#close-2");
  });
});

test.describe("Synthetic – attributeOverlap gradients", () => {
  /**
   * GOAL: attributeOverlap at various levels — especially for inputs
   * where type/name/placeholder survive across refactors.
   */
  test("inputs with no ID – attribute survival", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <form>
          <input type="text"     placeholder="First Name"     name="fname"   aria-label="First Name" />
          <input type="text"     placeholder="Last Name"      name="lname"   aria-label="Last Name" />
          <input type="email"    placeholder="Email Address"  name="email"   aria-label="Email Address" />
          <input type="tel"      placeholder="Phone Number"   name="phone"   aria-label="Phone Number" />
          <input type="password" placeholder="Password"       name="pass"    aria-label="Password" />
          <input type="text"     placeholder="Street Address" name="street"  aria-label="Street Address" />
          <input type="text"     placeholder="City"           name="city"    aria-label="City" />
          <input type="text"     placeholder="ZIP Code"       name="zip"     aria-label="ZIP Code" />
          <input type="text"     placeholder="Country"        name="country" aria-label="Country" />
        </form>
      </body></html>
    `);

    await collectElement(page, "fname_field",    "input[name='fname']");
    await collectElement(page, "lname_field",    "input[name='lname']");
    await collectElement(page, "email_field",    "input[name='email']");
    await collectElement(page, "phone_field",    "input[name='phone']");
    await collectElement(page, "password_field", "input[name='pass']");
    await collectElement(page, "street_field",   "input[name='street']");
    await collectElement(page, "city_field",     "input[name='city']");
    await collectElement(page, "zip_field",      "input[name='zip']");
  });

  test("identical form grid rows – only data-field differs", async ({ page }) => {
    // This is the hardest case: same tag, same class, same parent, same depth
    // Only the data-field and name attribute differ — pure attributeOverlap
    await page.setContent(`
      <html><body>
        <form class="data-grid">
          <div class="row"><input class="grid-cell" type="text" data-field="name"     name="name"     placeholder="Name" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="email"    name="email"    placeholder="Email" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="phone"    name="phone"    placeholder="Phone" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="company"  name="company"  placeholder="Company" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="role"     name="role"     placeholder="Role" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="dept"     name="dept"     placeholder="Department" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="manager"  name="manager"  placeholder="Manager" /></div>
          <div class="row"><input class="grid-cell" type="text" data-field="location" name="location" placeholder="Location" /></div>
        </form>
      </body></html>
    `);

    await collectElement(page, "grid_name",     "input[data-field='name']");
    await collectElement(page, "grid_email",    "input[data-field='email']");
    await collectElement(page, "grid_phone",    "input[data-field='phone']");
    await collectElement(page, "grid_company",  "input[data-field='company']");
    await collectElement(page, "grid_role",     "input[data-field='role']");
    await collectElement(page, "grid_dept",     "input[data-field='dept']");
    await collectElement(page, "grid_manager",  "input[data-field='manager']");
    await collectElement(page, "grid_location", "input[data-field='location']");
  });
});

test.describe("Synthetic – depthDiff variation", () => {
  /**
   * GOAL: depthDiff at multiple values (0.1, 0.3, 0.5, 0.8).
   * Ensures the model uses structural depth as a feature.
   */
  test("elements at different DOM depths", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <!-- Depth ~3 (shallow) -->
        <section><div>
          <button id="shallow-btn" type="button">Shallow Button</button>
        </div></section>

        <!-- Depth ~6 (medium) -->
        <div class="app"><div class="page"><div class="content"><div class="panel"><div class="card">
          <button id="medium-btn" type="button">Medium Button</button>
        </div></div></div></div></div>

        <!-- Depth ~10 (deep) -->
        <div class="l1"><div class="l2"><div class="l3"><div class="l4"><div class="l5">
        <div class="l6"><div class="l7"><div class="l8">
          <button id="deep-btn" type="button">Deep Button</button>
        </div></div></div></div></div></div></div></div>

        <!-- Inputs at varying depths -->
        <form><input id="form-input-shallow" type="text" name="shallow" /></form>

        <div class="a"><div class="b"><div class="c"><div class="d">
          <form><input id="form-input-deep" type="text" name="deep" /></form>
        </div></div></div></div>
      </body></html>
    `);

    await collectElement(page, "shallow_button",     "#shallow-btn");
    await collectElement(page, "medium_button",      "#medium-btn");
    await collectElement(page, "deep_button",        "#deep-btn");
    await collectElement(page, "shallow_input",      "#form-input-shallow");
    await collectElement(page, "deep_input",         "#form-input-deep");
  });
});

test.describe("Synthetic – siblingDensity variation", () => {
  /**
   * GOAL: siblingDensity at low (0.1), medium (0.5), and high (1.0) values.
   */
  test("lone button vs toolbar vs large list", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <!-- siblingCount = 1 (alone in parent) -->
        <section class="cta">
          <button id="lone-btn">Only Action</button>
        </section>

        <!-- siblingCount = 5 (small toolbar) -->
        <div class="toolbar">
          <button data-tool="bold">B</button>
          <button data-tool="italic">I</button>
          <button data-tool="underline">U</button>
          <button data-tool="link">Link</button>
          <button data-tool="clear">Clear</button>
        </div>

        <!-- siblingCount = 12 (large menu — capped at 1.0 by siblingDensity formula) -->
        <ul class="menu">
          <li><button data-cmd="c1">Item 1</button></li>
          <li><button data-cmd="c2">Item 2</button></li>
          <li><button data-cmd="c3">Item 3</button></li>
          <li><button data-cmd="c4">Item 4</button></li>
          <li><button data-cmd="c5">Item 5</button></li>
          <li><button data-cmd="c6">Item 6</button></li>
          <li><button data-cmd="c7">Item 7</button></li>
          <li><button data-cmd="c8">Item 8</button></li>
          <li><button data-cmd="c9">Item 9</button></li>
          <li><button data-cmd="c10">Item 10</button></li>
          <li><button data-cmd="c11">Item 11</button></li>
          <li><button data-cmd="c12">Item 12</button></li>
        </ul>
      </body></html>
    `);

    await collectElement(page, "lone_action_btn",       "#lone-btn");
    await collectElement(page, "toolbar_bold_btn",      "button[data-tool='bold']");
    await collectElement(page, "toolbar_italic_btn",    "button[data-tool='italic']");
    await collectElement(page, "toolbar_clear_btn",     "button[data-tool='clear']");
    await collectElement(page, "menu_item_cmd1",        "button[data-cmd='c1']");
    await collectElement(page, "menu_item_cmd6",        "button[data-cmd='c6']");
    await collectElement(page, "menu_item_cmd12",       "button[data-cmd='c12']");
  });
});

test.describe("Synthetic – parentMatch coverage", () => {
  /**
   * GOAL: parentMatch = 0 and 1 across many combinations.
   * Same element type inside nav, form, table, footer, header, aside, main.
   */
  test("same tag in different parent containers", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <nav>    <button id="nav-btn"    type="button">Nav Action</button>    </nav>
        <form>   <button id="form-btn"   type="submit">Form Submit</button>   </form>
        <table>  <tbody><tr><td>
                 <button id="table-btn"  type="button">Table Action</button>
                 </td></tr></tbody></table>
        <footer> <button id="footer-btn" type="button">Footer Action</button> </footer>
        <aside>  <button id="aside-btn"  type="button">Sidebar Action</button></aside>
        <header> <button id="header-btn" type="button">Header Action</button> </header>
        <main>   <button id="main-btn"   type="button">Main Action</button>   </main>
        <section><button id="section-btn"type="button">Section Action</button></section>
        <article><button id="article-btn"type="button">Article Action</button></article>
      </body></html>
    `);

    await collectElement(page, "nav_btn",      "#nav-btn");
    await collectElement(page, "form_btn",     "#form-btn");
    await collectElement(page, "table_btn",    "#table-btn");
    await collectElement(page, "footer_btn",   "#footer-btn");
    await collectElement(page, "aside_btn",    "#aside-btn");
    await collectElement(page, "header_btn",   "#header-btn");
    await collectElement(page, "main_btn",     "#main-btn");
    await collectElement(page, "section_btn",  "#section-btn");
    await collectElement(page, "article_btn",  "#article-btn");
  });
});

test.describe("Synthetic – idMatch false positive prevention", () => {
  /**
   * GOAL: idMatch=1 for correct, idMatch=0 for all others.
   * Also tests similar-looking IDs that must NOT match.
   */
  test("similar ID patterns", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button id="submit"          type="submit">Submit</button>
        <button id="submit-btn"      type="button">Submit Button</button>
        <button id="submit-form"     type="button">Submit Form</button>
        <button id="submit-order"    type="submit">Submit Order</button>
        <button id="resubmit"        type="button">Resubmit</button>
        <button id="submit-payment"  type="submit">Submit Payment</button>
        <button id="submit-review"   type="button">Submit for Review</button>
        <input  id="submit-input"    type="submit" value="Go" />
      </body></html>
    `);

    await collectElement(page, "primary_submit",    "#submit");
    await collectElement(page, "submit_btn_id",     "#submit-btn");
    await collectElement(page, "submit_order_id",   "#submit-order");
    await collectElement(page, "resubmit_id",       "#resubmit");
    await collectElement(page, "submit_payment_id", "#submit-payment");
  });
});

test.describe("Synthetic – attribute-only elements (no text, no ID)", () => {
  /**
   * GOAL: Force the model to rely entirely on attributeOverlap.
   * Icon buttons, image elements — text is empty/icon-only.
   */
  test("aria-label and data-action elements", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button aria-label="Close dialog"    data-action="close"    type="button">✕</button>
        <button aria-label="Open menu"       data-action="menu"     type="button">☰</button>
        <button aria-label="Search"          data-action="search"   type="button">🔍</button>
        <button aria-label="Back"            data-action="back"     type="button">←</button>
        <button aria-label="Forward"         data-action="forward"  type="button">→</button>
        <button aria-label="Refresh page"    data-action="refresh"  type="button">↺</button>
        <button aria-label="Download file"   data-action="download" type="button">⬇</button>
        <button aria-label="Upload file"     data-action="upload"   type="button">⬆</button>
        <button aria-label="Share content"   data-action="share"    type="button">↗</button>
        <button aria-label="Delete item"     data-action="delete"   type="button">🗑</button>
      </body></html>
    `);

    await collectElement(page, "close_dialog_btn",   "button[data-action='close']");
    await collectElement(page, "open_menu_btn",      "button[data-action='menu']");
    await collectElement(page, "search_btn",         "button[data-action='search']");
    await collectElement(page, "back_btn",           "button[data-action='back']");
    await collectElement(page, "download_btn",       "button[data-action='download']");
    await collectElement(page, "upload_btn",         "button[data-action='upload']");
    await collectElement(page, "delete_btn",         "button[data-action='delete']");
  });
});

test.describe("Synthetic – mixed element types", () => {
  /**
   * GOAL: Diverse tag coverage — select, textarea, checkbox, radio.
   * These element types have different attribute profiles and must be covered.
   */
  test("form with all input types", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <form id="diverse-form">
          <input  id="text-field"      type="text"     name="fullname"   placeholder="Full Name" />
          <input  id="email-field"     type="email"    name="email"      placeholder="Email" />
          <input  id="password-field"  type="password" name="password"   placeholder="Password" />
          <input  id="number-field"    type="number"   name="quantity"   placeholder="Quantity" min="0" max="100" />
          <input  id="date-field"      type="date"     name="dob" />
          <input  id="checkbox-agree"  type="checkbox" name="agree"      value="yes" />
          <input  id="checkbox-news"   type="checkbox" name="newsletter"  value="yes" />
          <input  id="radio-male"      type="radio"    name="gender"     value="male" />
          <input  id="radio-female"    type="radio"    name="gender"     value="female" />
          <select id="country-select"  name="country">
            <option value="">Select Country</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
          </select>
          <select id="role-select"     name="role">
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <textarea id="notes-area"    name="notes"    placeholder="Additional notes" rows="4"></textarea>
          <textarea id="address-area"  name="address"  placeholder="Full address" rows="3"></textarea>
          <button id="form-submit-btn" type="submit">Submit</button>
          <button id="form-reset-btn"  type="reset">Reset</button>
          <button id="form-cancel-btn" type="button">Cancel</button>
        </form>
      </body></html>
    `);

    await collectElement(page, "text_input",         "#text-field");
    await collectElement(page, "email_input",        "#email-field");
    await collectElement(page, "password_input_syn", "#password-field");
    await collectElement(page, "number_input",       "#number-field");
    await collectElement(page, "date_input",         "#date-field");
    await collectElement(page, "checkbox_agree",     "#checkbox-agree");
    await collectElement(page, "checkbox_newsletter","#checkbox-news");
    await collectElement(page, "radio_male",         "#radio-male");
    await collectElement(page, "radio_female",       "#radio-female");
    await collectElement(page, "country_select",     "#country-select");
    await collectElement(page, "role_select",        "#role-select");
    await collectElement(page, "notes_textarea",     "#notes-area");
    await collectElement(page, "address_textarea",   "#address-area");
    await collectElement(page, "submit_btn_syn",     "#form-submit-btn");
    await collectElement(page, "reset_btn_syn",      "#form-reset-btn");
    await collectElement(page, "cancel_btn_syn",     "#form-cancel-btn");
  });

  test("navigation menus and breadcrumbs", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <nav id="main-nav">
          <a id="nav-home"      href="/">Home</a>
          <a id="nav-about"     href="/about">About</a>
          <a id="nav-services"  href="/services">Services</a>
          <a id="nav-pricing"   href="/pricing">Pricing</a>
          <a id="nav-contact"   href="/contact">Contact</a>
          <a id="nav-login"     href="/login">Login</a>
          <a id="nav-signup"    href="/signup">Sign Up</a>
        </nav>
        <nav id="breadcrumb" aria-label="breadcrumb">
          <a id="bc-home"      href="/">Home</a>
          <a id="bc-products"  href="/products">Products</a>
          <a id="bc-category"  href="/products/shoes">Shoes</a>
          <a id="bc-item"      href="/products/shoes/nike">Nike Air Max</a>
        </nav>
        <footer>
          <a id="ft-privacy"   href="/privacy">Privacy Policy</a>
          <a id="ft-terms"     href="/terms">Terms of Service</a>
          <a id="ft-support"   href="/support">Support</a>
        </footer>
      </body></html>
    `);

    await collectElement(page, "main_nav_home",      "#nav-home");
    await collectElement(page, "main_nav_about",     "#nav-about");
    await collectElement(page, "main_nav_login",     "#nav-login");
    await collectElement(page, "main_nav_signup",    "#nav-signup");
    await collectElement(page, "breadcrumb_home",    "#bc-home");
    await collectElement(page, "breadcrumb_product", "#bc-products");
    await collectElement(page, "breadcrumb_item",    "#bc-item");
    await collectElement(page, "footer_privacy",     "#ft-privacy");
    await collectElement(page, "footer_terms",       "#ft-terms");
  });
});
