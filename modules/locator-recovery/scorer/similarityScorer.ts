import { LocatorMetadata, CandidateMetadata } from "../../../core/types/LocatorMetadata";


export function scoreCandidate(
  original: LocatorMetadata,
  candidate: CandidateMetadata
): number {


  let score = 0;

  // Tag match
  if (original.tag === candidate.tag) score += 20;

  // ID match (strong signal)
  if (original.id && candidate.id && original.id === candidate.id) {
    score += 30;
  }

  // Class overlap
  const classMatches = original.classes.filter(cls =>
    candidate.classes.includes(cls)
  ).length;

  score += classMatches * 5;

  // Attribute overlap
  const attrMatches = Object.keys(original.attributes).filter(key =>
    candidate.attributes[key] === original.attributes[key]
  ).length;

  score += attrMatches * 3;

  // Text similarity
  if (original.text && candidate.text) {
    if (original.text === candidate.text) score += 15;
  }

  return score;
}

