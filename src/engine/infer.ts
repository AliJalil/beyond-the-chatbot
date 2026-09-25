// The pipeline: data → features → intent inference → surfaced decision.

import { buildAction } from './actions';
import { extractFeatures } from './features';
import { IntentModel } from './model';
import { gistOf, TfIdfIndex } from './text';
import type { Dataset, Decision, Hypothesis, Issue, IntentId, SimilarMatch } from './types';
import { INTENTS } from './types';

/** How much a decision matters if it's right, independent of confidence. */
export const URGENCY: Record<IntentId, number> = {
  security: 1.6, // always surfaces first
  regression: 0.9,
  'bug-ready': 0.65,
  duplicate: 0.6,
  'needs-repro': 0.55,
  question: 0.45,
  docs: 0.35,
  feature: 0.3,
  stale: 0.25,
};

/** Below these the interface asks instead of guessing. */
export const ABSTAIN = { minConfidence: 0.45, minMargin: 0.12 };

export interface InferOptions {
  now?: Date;
  model?: IntentModel;
}

export class Corpus {
  readonly index: TfIdfIndex;
  readonly byNumber = new Map<number, Issue>();
  constructor(readonly data: Dataset) {
    const all = [...data.open, ...data.closed];
    for (const i of all) this.byNumber.set(i.number, i);
    // Title is weighted twice: titles carry most of the signal in bug trackers.
    this.index = new TfIdfIndex(all.map((i) => ({ id: i.number, text: `${i.title}\n${i.title}\n${i.body.slice(0, 2500)}` })));
  }

  similarTo(issue: Issue, k = 3): SimilarMatch[] {
    return this.index
      .nearest(issue.number, 12)
      .map((n) => ({ n, other: this.byNumber.get(n.id)! }))
      // A valid duplicate target is older, or already closed as completed.
      .filter(({ other }) => other && (other.state === 'closed' ? other.stateReason !== 'not_planned' : other.number < issue.number))
      .slice(0, k)
      .map(({ n, other }) => ({ number: other.number, title: other.title, score: n.score, state: other.state, sharedTerms: n.shared }));
  }
}

export function decide(issue: Issue, corpus: Corpus, model: IntentModel, now: Date): Decision {
  const similar = corpus.similarTo(issue);
  const { vector, notes } = extractFeatures(issue, { now, similar });
  const probs = model.predict(vector);
  const ctx = { repo: corpus.data.repo, repoLabels: corpus.data.labels, similar, features: vector };
  const hypotheses: Hypothesis[] = INTENTS.map((intent) => ({
    intent,
    prob: probs[intent],
    evidence: model.explain(vector, intent, notes),
    action: buildAction(intent, issue, ctx),
  })).sort((a, b) => b.prob - a.prob);

  const [top, second] = hypotheses;
  const margin = top.prob - (second?.prob ?? 0);
  const abstain = top.prob < ABSTAIN.minConfidence || margin < ABSTAIN.minMargin;
  const traction = vector.traction;
  const priority = URGENCY[top.intent] * (0.55 + 0.45 * traction) * (abstain ? 0.9 : 0.6 + 0.4 * top.prob);

  return { issue, gist: gistOf(issue.title, issue.body), features: vector, featureNotes: notes, similar, hypotheses, confidence: top.prob, margin, abstain, priority };
}

export function inferAll(data: Dataset, opts: InferOptions = {}): { decisions: Decision[]; corpus: Corpus; model: IntentModel } {
  const now = opts.now ?? new Date();
  const model = opts.model ?? new IntentModel();
  const corpus = new Corpus(data);
  const decisions = data.open.map((i) => decide(i, corpus, model, now));
  return { decisions, corpus, model };
}

/** Re-score decisions after the model learned something; reports which cards changed their top guess. */
export function rescore(decisions: Decision[], corpus: Corpus, model: IntentModel, now: Date): { decisions: Decision[]; changed: number[] } {
  const changed: number[] = [];
  const next = decisions.map((d) => {
    const nd = decide(d.issue, corpus, model, now);
    if (nd.hypotheses[0].intent !== d.hypotheses[0].intent || nd.abstain !== d.abstain) changed.push(d.issue.number);
    return nd;
  });
  return { decisions: next, changed };
}
