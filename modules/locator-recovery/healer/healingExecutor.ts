import { Page, Locator } from "@playwright/test";
import { loadMetadata } from "../matcher/MetadataLoader";
import { findCandidateElements } from "../matcher/domCandidateFinder";
import { selectBestCandidate } from "../scorer/selectBestCandidate";
import { logger } from "../../../core/logger/logger";
import { logFeatureVector } from "../ml/featureLogger";
import { extractFeatures } from "../ml/featureExtractor";
import { collectLocatorMetadata } from "../collector/LocatorCollector";
import { predictHealing } from "../../../core/ml/healingClient";
import { scoreCandidate } from "../scorer/similarityScorer";



export async function getHealedLocator(
  page: Page,
  originalSelector: string,
  stepName: string
): Promise<Locator | null> {

  const original = page.locator(originalSelector);

  //Try original locator first
  try {
      await original.first().waitFor({ timeout: 2000 });

      logger.info(`Original locator worked for step: ${stepName}`);

      // store metadata automatically
      await collectLocatorMetadata(original.first(), stepName);

      return original;
    } catch {
      logger.warn(`Original locator failed for step: ${stepName}`);
    }

  // Load stored metadata
  const metadata = await loadMetadata(stepName);

  if (!metadata || !metadata.tag) {
    logger.error(`No metadata available for healing step: ${stepName}`);
    return null;
  }

  // Find candidates on page
  const candidates = await findCandidateElements(page, metadata.tag);

  if (!candidates.length) {
    logger.error(`No candidates found for healing step: ${stepName}`);
    return null;
  }

  // Select best match
    let bestCandidate = null;
    let bestScore = 0;

    for (const candidate of candidates) {

      // heuristic score first
      const heuristicScore = scoreCandidate(metadata, candidate.metadata);
      logger.info(`Heuristic score for ${stepName}: ${heuristicScore}`);
      let finalScore = heuristicScore;

      // fallback to ML if heuristic is weak
      if (heuristicScore < 40) {

        const features = await extractFeatures(
          stepName,
          metadata,
          candidate.metadata
        );

        const mlProbability = await predictHealing(features);

        finalScore = mlProbability * 100;

        logger.info(
          `ML fallback used for ${stepName} → probability ${mlProbability}`
        );
      }

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      logger.error(`Healing failed for step ${stepName}`);
      return null;
    }

    logger.info(`Best locator selected with score ${bestScore}`);

    const best = bestCandidate;

  for (const candidate of candidates) {

  const features = await extractFeatures(
      stepName,
      metadata,
      candidate.metadata
    );

  await logFeatureVector({
    stepName,
    features,
    chosen: candidate === best,
    timestamp: new Date().toISOString()
  });
}



  // Return healed locator
  return best.locator;
}
