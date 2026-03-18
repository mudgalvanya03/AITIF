import { LocatorMetadata, CandidateMetadata } from "../../../core/types/LocatorMetadata";
import { scoreCandidate } from "./similarityScorer";


export function selectBestCandidate(
  original: LocatorMetadata,
  candidates: { locator: any; metadata: CandidateMetadata }[]
)
 {

  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreCandidate(original, candidate.metadata);

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return { best, bestScore };
}
