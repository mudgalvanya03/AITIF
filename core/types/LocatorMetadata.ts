export interface LocatorMetadata {
  stepName: string;
  tag: string | null;
  id: string | null;
  classes: string[];
  text: string | null;
  attributes: Record<string, string>;
  timestamp: string;
}

export interface CandidateMetadata {
  tag: string;
  id: string | null;
  classes: string[];
  text: string | null;
  attributes: Record<string, string>;

  parentTag?: string | null;
  depth?: number;
  siblingCount?: number;
}

