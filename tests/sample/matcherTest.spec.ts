import { test } from "@playwright/test";
import { loadMetadata } from "../../modules/locator-recovery/matcher/MetadataLoader";
import { findCandidateElements } from "../../modules/locator-recovery/matcher/domCandidateFinder";
import { selectBestCandidate } from "../../modules/locator-recovery/scorer/selectBestCandidate";

test("Test matcher pieces", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  const meta = await loadMetadata("login_button");

  console.log(meta);

  if (meta && meta.tag) {

    const candidates = await findCandidateElements(page, meta.tag);

    console.log("Found candidates:", candidates.length);

    // 👇 THIS PART WAS MISSING
    const result = selectBestCandidate(meta, candidates);

    console.log("Best score:", result.bestScore);

  } else {
    console.log("No metadata or tag missing");
  }

});

