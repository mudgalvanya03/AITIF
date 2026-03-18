import { LocatorMetadata, CandidateMetadata } from "../../../core/types/LocatorMetadata";
import levenshtein from "fast-levenshtein";
import { getSemanticSimilarity } from "../../../core/ml/semanticClient";

export async function extractFeatures(
  stepName: string,
  original: LocatorMetadata,
  candidate: CandidateMetadata,

  //heuristicScore: number
) {

  // Tag match
  const tagMatch = original.tag === candidate.tag ? 1 : 0;

  // ID match
  const idMatch =
    original.id && candidate.id && original.id === candidate.id ? 1 : 0;

  // Class overlap ratio
  const originalClasses = original.classes || [];
  const candidateClasses = candidate.classes || [];

  const commonClasses = originalClasses.filter(c =>
    candidateClasses.includes(c)
  ).length;

  const classOverlap =
    originalClasses.length > 0
      ? commonClasses / originalClasses.length
      : 0;

  // Attribute overlap ratio  (FIXED SAFE ACCESS)
  const originalAttrs = original.attributes || {};
  const candidateAttrs = candidate.attributes || {};

  const attrKeys = Object.keys(originalAttrs);

  const attrMatches = attrKeys.filter(
    key => candidateAttrs[key] === originalAttrs[key]
  ).length;

  const attributeOverlap =
    attrKeys.length > 0 ? attrMatches / attrKeys.length : 0;

  // Text match
  const textMatch =
    original.text && candidate.text && original.text === candidate.text
      ? 1
      : 0;

  // Levenshtein similarity
  let textSimilarity = 0;

  // Extract usable text
  const originalText =
    original.text ||
    original.attributes?.value ||
    original.attributes?.["aria-label"] ||
    "";

  const candidateText =
    candidate.text ||
    candidate.attributes?.value ||
    candidate.attributes?.["aria-label"] ||
    "";

  if (originalText && candidateText) {
    const distance = levenshtein.get(
      originalText.toLowerCase(),
      candidateText.toLowerCase()
    );

    const maxLen = Math.max(originalText.length, candidateText.length);

    textSimilarity = maxLen > 0 ? 1 - distance / maxLen : 0;
  }

  const normalizedStep =
  typeof stepName === "string" ? stepName.replace(/_/g, " ") : "";

  const semanticSimilarity = await getSemanticSimilarity(
    normalizedStep,
    candidateText
  );

  // Parent tag match
  const parentMatch =
    original.tag && candidate.parentTag && original.tag === candidate.parentTag
      ? 1
      : 0;

  // Depth difference normalized
  const depthDiff =
    typeof candidate.depth === "number"
      ? Math.min(candidate.depth / 20, 1)
      : 0;

  // Sibling density (normalized)
  const siblingDensity =
    typeof candidate.siblingCount === "number"
      ? Math.min(candidate.siblingCount / 10, 1)
      : 0;

  return {
    tagMatch,
    idMatch,
    classOverlap,
    attributeOverlap,
    textMatch,
    textSimilarity,
    semanticSimilarity,
    parentMatch,
    depthDiff,
    siblingDensity
  };
}