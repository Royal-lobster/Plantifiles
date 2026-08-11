export const COMPONENT_NAMES = [
  "TLDR",
  "Decision",
  "Tradeoff",
  "Option",
  "Rejected",
  "Phase",
  "Risk",
  "Diagram",
  "CodeSketch",
  "Callout",
] as const;

export type ComponentName = (typeof COMPONENT_NAMES)[number];

export type Block = {
  key: string;
  kind: string;
  ordinal: number;
  contentHash: string;
  source: string;
  title?: string;
  headingPath: string[];
  line: number;
};

export type LintSeverity = "error" | "warning";

export type LintFinding = {
  rule: string;
  severity: LintSeverity;
  message: string;
  line: number;
  blockKey?: string;
};

export type LintReport = {
  errors: number;
  warnings: number;
  score: number;
  readTimeMinutes: number;
  canPublish: boolean;
  findings: LintFinding[];
};

export type ChangeType = "added" | "removed" | "modified" | "moved";

export type BlockChange = {
  type: ChangeType;
  key: string;
  kind: string;
  previous?: Block;
  next?: Block;
};

export type StructuralDiff = {
  changes: BlockChange[];
  summary: string;
};

export type SkimBlock = Pick<Block, "key" | "kind" | "source" | "title" | "ordinal">;
