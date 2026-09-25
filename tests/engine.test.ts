import { describe, expect, it } from 'vitest';
import { sampleDataset, SAMPLE_EXPECTED } from '../src/data/sample';
import {
  Corpus,
  decide,
  extractFeatures,
  inferAll,
  IntentModel,
  makeEntry,
  orderQueue,
  inferFocus,
  parseRepo,
  rescore,
  resolveLabel,
  selectForAutopilot,
  TfIdfIndex,
  toGhScript,
  tokenize,
} from '../src/engine';

const NOW = new Date('2026-09-25T12:00:00Z');
const data = () => sampleDataset(NOW);

describe('text', () => {
  it('tokenizes code identifiers and drops stopwords', () => {
    expect(tokenize('The import.meta.glob() call is broken')).toEqual(['import', 'meta', 'glob', 'call', 'broken']);
  });
  it('finds the nearest document by tf-idf cosine', () => {
    const idx = new TfIdfIndex([
      { id: 1, text: 'hmr full reload vue sfc' },
      { id: 2, text: 'css modules hashing global' },
      { id: 3, text: 'vue sfc edit causes full reload instead of hmr' },
    ]);
    expect(idx.nearest(1, 1)[0].id).toBe(3);
  });
});

describe('features', () => {
  it('extracts completeness signals with quotable evidence', () => {
    const d = data();
    const issue = d.open.find((i) => i.number === 1403)!;
    const { vector, notes } = extractFeatures(issue, { now: NOW, similar: [] });
    expect(vector.reproLink).toBe(1);
    expect(vector.stepsToReproduce).toBe(1);
    expect(vector.versionInfo).toBe(1);
    expect(notes.reproLink).toMatch(/github\.com/);
  });
  it('treats an unfilled template as unfilled', () => {
    const issue = data().open.find((i) => i.number === 1401)!;
    expect(extractFeatures(issue, { now: NOW, similar: [] }).vector.templateUnfilled).toBe(1);
  });
});

describe('intent inference', () => {
  const { decisions } = inferAll(data(), { now: NOW });

  it('gets the expected top intent on the sample set (confident cards only)', () => {
    const confident = decisions.filter((d) => !d.abstain);
    const right = confident.filter((d) => d.hypotheses[0].intent === SAMPLE_EXPECTED[d.issue.number]);
    expect(right.length / confident.length).toBeGreaterThanOrEqual(0.9);
  });

  it('points duplicates at an older issue, including closed ones', () => {
    const dup = decisions.find((d) => d.issue.number === 1411)!;
    expect(dup.hypotheses[0].action.duplicateOf).toBe(1409);
    const answered = decisions.find((d) => d.issue.number === 1396)!;
    expect(answered.hypotheses[0].action.duplicateOf).toBe(1288);
  });

  it('never proposes a newer issue as the duplicate target', () => {
    const older = decisions.find((d) => d.issue.number === 1409)!;
    expect(older.similar.every((s) => s.state === 'closed' || s.number < 1409)).toBe(true);
  });

  it('abstains (asks) instead of guessing on an ambiguous issue', () => {
    const vague = decisions.find((d) => d.issue.number === 1352)!;
    expect(vague.abstain).toBe(true);
  });

  it('explains every guess with evidence', () => {
    for (const d of decisions) expect(d.hypotheses[0].evidence.length).toBeGreaterThan(0);
  });

  it('routes bugs to an area label that exists in the repo', () => {
    const css = decisions.find((d) => d.issue.number === 1403)!;
    expect(css.hypotheses[0].action.addLabels).toContain('feat: css');
    expect(css.hypotheses[0].action.removeLabels).toContain('pending triage');
  });
});

describe('learning from corrections (failure recovery)', () => {
  it('a correction moves the model toward the human choice', () => {
    const d = data();
    const model = new IntentModel();
    const corpus = new Corpus(d);
    const vague = decide(d.open.find((i) => i.number === 1352)!, corpus, model, NOW);
    const before = vague.hypotheses.find((h) => h.intent === 'question')!.prob;
    model.learn(vague.features, 'question');
    const after = decide(vague.issue, corpus, model, NOW).hypotheses.find((h) => h.intent === 'question')!.prob;
    expect(after).toBeGreaterThan(before);
  });

  it('a rejection lowers the rejected intent', () => {
    const d = data();
    const model = new IntentModel();
    const corpus = new Corpus(d);
    const card = decide(d.open.find((i) => i.number === 1390)!, corpus, model, NOW);
    const top = card.hypotheses[0];
    model.learn(card.features, { not: top.intent });
    const again = decide(card.issue, corpus, model, NOW);
    expect(again.hypotheses.find((h) => h.intent === top.intent)!.prob).toBeLessThan(top.prob);
  });

  it('FAILURE TEST: one correction on an abstained card flips its reading (docs/FAILURE_TEST.md)', () => {
    const { decisions, corpus, model } = inferAll(data(), { now: NOW });
    const vague = decisions.find((d) => d.issue.number === 1352)!;
    expect(vague.abstain).toBe(true);
    expect(vague.hypotheses[0].intent).toBe('needs-repro');
    model.learn(vague.features, 'question');
    const after = rescore(decisions, corpus, model, NOW).decisions.find((d) => d.issue.number === 1352)!;
    expect(after.hypotheses[0].intent).toBe('question');
    expect(after.abstain).toBe(false);
  });

  it('FAILURE TEST: a rejected prepared action is re-checked and never silently re-staged unchanged', () => {
    const { decisions, corpus, model } = inferAll(data(), { now: NOW });
    const dup = decisions.find((d) => d.issue.number === 1411)!;
    const before = dup.confidence;
    model.learn(dup.features, { not: 'duplicate' });
    const again = rescore(decisions, corpus, model, NOW).decisions.find((d) => d.issue.number === 1411)!;
    expect(again.hypotheses.find((h) => h.intent === 'duplicate')!.prob).toBeLessThan(before);
  });

  it('rescore reports which queued cards changed after learning', () => {
    const { decisions, corpus, model } = inferAll(data(), { now: NOW });
    const vague = decisions.find((d) => d.issue.number === 1352)!;
    for (let i = 0; i < 3; i++) model.learn(vague.features, 'question');
    const { changed } = rescore(decisions, corpus, model, NOW);
    expect(changed).toContain(1352);
  });

  it('model state round-trips through JSON (persisted per repo)', () => {
    const m = new IntentModel();
    m.weights.docs.docsForm = 42;
    expect(IntentModel.fromJSON(JSON.parse(JSON.stringify(m))).weights.docs.docsForm).toBe(42);
  });
});

describe('session + autopilot', () => {
  const { decisions } = inferAll(data(), { now: NOW });

  it('stages only confident, non-high-risk actions', () => {
    const staged = selectForAutopilot(decisions, new Set());
    expect(staged.length).toBeGreaterThan(0);
    for (const d of staged) {
      expect(d.hypotheses[0].action.risk).not.toBe('high');
      expect(d.abstain).toBe(false);
    }
    expect(staged.map((d) => d.issue.number)).not.toContain(1412); // security is never auto-prepared
  });

  it('puts the security report first in the queue', () => {
    expect(orderQueue(decisions, new Set(), [], new Set())[0].issue.number).toBe(1412);
  });

  it('skipped cards go to the back', () => {
    const q = orderQueue(decisions, new Set(), [1412], new Set());
    expect(q[q.length - 1].issue.number).toBe(1412);
  });

  it('infers a focus mode from a streak of approvals', () => {
    const dupes = decisions.filter((d) => d.hypotheses[0].intent === 'duplicate');
    const ledger = dupes.map((d) => makeEntry(d, d.hypotheses[0].action, 'human'));
    expect(inferFocus(ledger)?.intent).toBe('duplicate');
  });
});

describe('ledger + GitHub helpers', () => {
  it('exports a reviewable gh CLI script and skips undone entries', () => {
    const { decisions } = inferAll(data(), { now: NOW });
    const a = makeEntry(decisions[0], decisions[0].hypotheses[0].action, 'human');
    const b = { ...makeEntry(decisions[1], decisions[1].hypotheses[0].action, 'autopilot'), undone: true };
    const script = toGhScript('sample/web-bundler', [a, b]);
    expect(script).toContain(`#${a.issue}`);
    expect(script).not.toContain(`#${b.issue} `);
    expect(script).toMatch(/gh issue (edit|close|comment)/);
  });
  it('resolves labels against the real label set', () => {
    expect(resolveLabel('needs-repro', ['bug', 'needs reproduction'])).toEqual({ name: 'needs reproduction', exists: true });
    expect(resolveLabel('docs', ['bug'])).toEqual({ name: 'documentation', exists: false });
  });
  it('parses repo input in several forms', () => {
    expect(parseRepo('https://github.com/vitejs/vite/issues')).toBe('vitejs/vite');
    expect(parseRepo('facebook/react-native')).toBe('facebook/react-native');
    expect(parseRepo('nope')).toBeNull();
  });
});
