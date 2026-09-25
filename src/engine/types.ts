// Core domain types. The engine is framework-free: it runs in the browser, in Node (CLI) and in tests.

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: number;
  author: string;
  authorAssociation: string; // OWNER | MEMBER | COLLABORATOR | CONTRIBUTOR | NONE ...
  createdAt: string;
  updatedAt: string;
  reactions: number;
  state: 'open' | 'closed';
  stateReason?: string | null;
  url: string;
}

export interface Dataset {
  repo: string; // owner/name
  fetchedAt: string;
  source: 'live' | 'snapshot' | 'sample';
  labels: string[];
  open: Issue[];
  closed: Issue[]; // recently closed, used as the duplicate-detection corpus
}

/** What the system believes an issue needs next. */
export const INTENTS = [
  'security',
  'regression',
  'duplicate',
  'needs-repro',
  'bug-ready',
  'question',
  'feature',
  'docs',
  'stale',
] as const;
export type IntentId = (typeof INTENTS)[number];

/** A named, explainable signal extracted from an issue. Values are in [0, 1]. */
export type FeatureId =
  | 'bias'
  | 'reproLink'
  | 'stepsToReproduce'
  | 'codeBlock'
  | 'stackTrace'
  | 'versionInfo'
  | 'questionForm'
  | 'featureForm'
  | 'regressionForm'
  | 'securityForm'
  | 'docsForm'
  | 'shortBody'
  | 'templateUnfilled'
  | 'staleness'
  | 'waitingOnAuthor'
  | 'similarity'
  | 'traction'
  | 'maintainerAuthor'
  | 'alreadyTriaged';

export type FeatureVector = Record<FeatureId, number>;

export interface Evidence {
  feature: FeatureId;
  label: string; // human sentence, e.g. "No reproduction link"
  detail?: string; // quoted snippet from the issue
  contribution: number; // weight × value for the chosen intent
}

export interface ProposedAction {
  intent: IntentId;
  verb: string; // short imperative, e.g. "Close as duplicate of #812"
  addLabels: string[];
  removeLabels: string[];
  comment?: string;
  close?: 'completed' | 'not_planned';
  duplicateOf?: number;
  risk: 'low' | 'medium' | 'high';
}

export interface Hypothesis {
  intent: IntentId;
  prob: number;
  evidence: Evidence[];
  action: ProposedAction;
}

export interface SimilarMatch {
  number: number;
  title: string;
  score: number;
  state: 'open' | 'closed';
  sharedTerms: string[];
}

export interface Decision {
  issue: Issue;
  gist: string;
  features: FeatureVector;
  featureNotes: Partial<Record<FeatureId, string>>;
  similar: SimilarMatch[];
  hypotheses: Hypothesis[]; // sorted by prob, desc
  confidence: number; // prob of the top hypothesis
  margin: number; // top prob - second prob
  abstain: boolean; // true when the system should ask instead of guess
  priority: number;
}

export type Actor = 'human' | 'autopilot';

export interface LedgerEntry {
  id: string;
  at: string;
  issue: number;
  issueTitle: string;
  action: ProposedAction;
  actor: Actor; // who proposed it; a human always approves
  predicted: IntentId; // what the model guessed first
  corrected: boolean; // human chose something other than the top guess
  applied: 'local' | 'github';
  undone: boolean;
}
