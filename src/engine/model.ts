// Intent model: a multinomial logistic model over explainable features.
// It starts from hand-set priors (what a maintainer would look for) and learns online from every
// human correction, so the interface's guesses adapt to how *this* maintainer triages *this* repo.

import { FEATURE_LABELS } from './features';
import type { Evidence, FeatureId, FeatureVector, IntentId } from './types';
import { INTENTS } from './types';

export const FEATURES: FeatureId[] = Object.keys(FEATURE_LABELS) as FeatureId[];

/** Sentence to show when a feature pushes the decision by being ABSENT. */
export const FEATURE_ABSENT: Partial<Record<FeatureId, string>> = {
  reproLink: 'No reproduction link',
  stepsToReproduce: 'No steps to reproduce',
  versionInfo: 'No version / environment info',
  stackTrace: 'No error output',
  questionForm: 'Not phrased as a question',
  featureForm: 'Not a feature request',
  similarity: 'No close match among other issues',
  traction: 'Nobody else has reported it',
  staleness: 'Recently active',
  alreadyTriaged: 'Not triaged yet',
  maintainerAuthor: 'Opened by an outside contributor',
  waitingOnAuthor: 'Not waiting on anyone',
  shortBody: 'Detailed description',
};

type Row = Partial<Record<FeatureId, number>>;

/**
 * Prior weights. "Completeness" features are centered (x - 0.5) so their ABSENCE is evidence too
 * (no repro link → needs-repro). Everything else is used raw, so a missing signal is neutral.
 */
export const PRIORS: Record<IntentId, Row> = {
  security: { bias: -3, securityForm: 9, questionForm: -1, featureForm: -1, docsForm: -1 },
  regression: { bias: -1.5, regressionForm: 6, stackTrace: 1, versionInfo: 1, reproLink: 1, featureForm: -2, questionForm: -1, alreadyTriaged: -1 },
  duplicate: { bias: -2, similarity: 10, shortBody: 0.5, maintainerAuthor: -1, alreadyTriaged: -1 },
  'needs-repro': { bias: 0, reproLink: -4, stepsToReproduce: -1.5, stackTrace: 1, versionInfo: -1, shortBody: 1, templateUnfilled: 2, questionForm: -2, featureForm: -3, docsForm: -2, maintainerAuthor: -3, waitingOnAuthor: -1, alreadyTriaged: -1, regressionForm: -0.5 },
  'bug-ready': { bias: -0.5, reproLink: 4, stepsToReproduce: 1.5, stackTrace: 1, versionInfo: 1, codeBlock: 0.5, featureForm: -3, questionForm: -2, alreadyTriaged: -2.5, maintainerAuthor: 1.5, traction: 1 },
  question: { bias: -1.5, questionForm: 5, featureForm: -1, reproLink: -1.5, shortBody: 0.5, maintainerAuthor: -2, regressionForm: -2 },
  feature: { bias: -1.5, featureForm: 6, questionForm: -1, stackTrace: -2, reproLink: -1, regressionForm: -2 },
  docs: { bias: -2.5, docsForm: 7, featureForm: -0.5 },
  stale: { bias: -3, staleness: 7, waitingOnAuthor: 3, traction: -2, maintainerAuthor: -2, securityForm: -3 },
};

export type Weights = Record<IntentId, Record<FeatureId, number>>;

export function priorWeights(): Weights {
  const w = {} as Weights;
  for (const k of INTENTS) {
    w[k] = {} as Record<FeatureId, number>;
    for (const f of FEATURES) w[k][f] = PRIORS[k][f] ?? 0;
  }
  return w;
}

export const CENTERED = new Set<FeatureId>(['reproLink', 'stepsToReproduce', 'versionInfo', 'stackTrace', 'shortBody']);
const center = (f: FeatureId, v: number) => (f === 'bias' ? 1 : CENTERED.has(f) ? v - 0.5 : v);

export class IntentModel {
  weights: Weights;
  updates = 0;
  constructor(weights?: Weights, private lr = 0.5) {
    this.weights = weights ? structuredClone(weights) : priorWeights();
  }

  logits(x: FeatureVector): Record<IntentId, number> {
    const out = {} as Record<IntentId, number>;
    for (const k of INTENTS) {
      let s = 0;
      for (const f of FEATURES) s += this.weights[k][f] * center(f, x[f]);
      out[k] = s;
    }
    return out;
  }

  predict(x: FeatureVector): Record<IntentId, number> {
    const z = this.logits(x);
    const max = Math.max(...Object.values(z));
    let sum = 0;
    const p = {} as Record<IntentId, number>;
    for (const k of INTENTS) {
      p[k] = Math.exp(z[k] - max);
      sum += p[k];
    }
    for (const k of INTENTS) p[k] /= sum;
    return p;
  }

  /** Why the model leans towards `intent`: the strongest positive contributions. */
  explain(x: FeatureVector, intent: IntentId, notes: Partial<Record<FeatureId, string>>, limit = 3): Evidence[] {
    const ev: Evidence[] = [];
    for (const f of FEATURES) {
      if (f === 'bias') continue;
      const c = this.weights[intent][f] * center(f, x[f]);
      if (c <= 0.25) continue;
      const present = x[f] >= 0.5;
      const label = present ? FEATURE_LABELS[f] : FEATURE_ABSENT[f] ?? `No “${FEATURE_LABELS[f].toLowerCase()}”`;
      ev.push({ feature: f, label, detail: present ? notes[f] : undefined, contribution: c });
    }
    return ev.sort((a, b) => b.contribution - a.contribution).slice(0, limit);
  }

  /**
   * Online update (one SGD step on cross-entropy).
   * target = the intent the human chose; or { not } when the human rejected a guess without picking one.
   * Returns the features whose weights moved most, for the "what I learned" toast.
   */
  learn(x: FeatureVector, target: IntentId | { not: IntentId }): { intent: IntentId; feature: FeatureId; delta: number }[] {
    const p = this.predict(x);
    const y = {} as Record<IntentId, number>;
    if (typeof target === 'string') {
      for (const k of INTENTS) y[k] = k === target ? 1 : 0;
    } else {
      const rest = 1 - p[target.not] || 1;
      for (const k of INTENTS) y[k] = k === target.not ? 0 : p[k] / rest;
    }
    const moves: { intent: IntentId; feature: FeatureId; delta: number }[] = [];
    for (const k of INTENTS) {
      const g = y[k] - p[k];
      if (Math.abs(g) < 1e-3) continue;
      for (const f of FEATURES) {
        const d = this.lr * g * center(f, x[f]);
        if (d === 0) continue;
        this.weights[k][f] += d;
        if (f !== 'bias') moves.push({ intent: k, feature: f, delta: d });
      }
    }
    this.updates++;
    return moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  }

  toJSON() {
    return { weights: this.weights, updates: this.updates };
  }

  static fromJSON(o: { weights: Weights; updates: number }): IntentModel {
    const m = new IntentModel(mergeWithPriors(o.weights));
    m.updates = o.updates ?? 0;
    return m;
  }
}

/** Tolerate stored weights from an older feature set. */
function mergeWithPriors(w: Partial<Weights>): Weights {
  const base = priorWeights();
  for (const k of INTENTS) for (const f of FEATURES) if (typeof w?.[k]?.[f] === 'number') base[k][f] = w[k]![f];
  return base;
}
