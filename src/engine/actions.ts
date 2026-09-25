// Turns an inferred intent into a concrete, reviewable action: labels, a drafted reply, open/close.
// Labels are resolved against the repo's real label set, so the same engine works on any repository.

import { tokenize } from './text';
import type { FeatureVector, Issue, IntentId, ProposedAction, SimilarMatch } from './types';

const LABEL_PATTERNS: Record<IntentId, RegExp[]> = {
  security: [/security/i],
  regression: [/regression/i],
  duplicate: [/^duplicate$/i, /duplicate/i],
  'needs-repro': [/need(s)?[ -]?repro/i, /need(s)? reproduction/i, /repro/i, /need(s)? (more )?info/i],
  'bug-ready': [/^bug$/i, /type: ?bug/i, /confirmed/i, /bug/i],
  question: [/^question$/i, /question/i, /support/i],
  feature: [/^enhancement$/i, /feat(ure)? ?request/i, /type: ?feat/i, /enhancement|proposal/i],
  docs: [/^documentation$/i, /^docs?$/i, /documentation|docs/i],
  stale: [/^stale$/i, /inactive|stale/i],
};
const FALLBACK: Record<IntentId, string> = {
  security: 'security',
  regression: 'regression',
  duplicate: 'duplicate',
  'needs-repro': 'needs reproduction',
  'bug-ready': 'bug',
  question: 'question',
  feature: 'enhancement',
  docs: 'documentation',
  stale: 'stale',
};
const TRIAGE_PENDING = /(pending|needs?)[ -]triage|^triage$|^untriaged$/i;
const AREA_PREFIX = /^(feat|area|scope|pkg|plugin|component|module|topic)\s*[:/-]\s*/i;

export function resolveLabel(intent: IntentId, repoLabels: string[]): { name: string; exists: boolean } {
  for (const rx of LABEL_PATTERNS[intent]) {
    const hit = repoLabels.find((l) => rx.test(l));
    if (hit) return { name: hit, exists: true };
  }
  return { name: FALLBACK[intent], exists: false };
}

/** Pick the repo's "area" label whose name best matches the issue text (e.g. `feat: css`). */
export function inferAreaLabel(issue: Issue, repoLabels: string[]): string | undefined {
  const words = new Set(tokenize(`${issue.title} ${issue.title} ${issue.body.slice(0, 1500)}`));
  let best: { label: string; score: number } | undefined;
  for (const label of repoLabels) {
    if (!AREA_PREFIX.test(label)) continue;
    const terms = tokenize(label.replace(AREA_PREFIX, ''));
    if (!terms.length) continue;
    const hits = terms.filter((t) => words.has(t)).length / terms.length;
    if (hits > 0 && (!best || hits > best.score)) best = { label, score: hits };
  }
  return best && best.score >= 0.5 ? best.label : undefined;
}

export interface ActionContext {
  repo: string;
  repoLabels: string[];
  similar: SimilarMatch[];
  features: FeatureVector;
}

export function buildAction(intent: IntentId, issue: Issue, ctx: ActionContext): ProposedAction {
  const { name: label } = resolveLabel(intent, ctx.repoLabels);
  const pending = issue.labels.filter((l) => TRIAGE_PENDING.test(l));
  const hi = `Hi @${issue.author}, thanks for the report.`;
  const f = ctx.features;
  const base = { intent, removeLabels: pending, addLabels: [label] as string[] };

  switch (intent) {
    case 'duplicate': {
      const target = pickDuplicateTarget(issue, ctx.similar);
      if (!target) return { ...base, verb: 'Mark as possible duplicate', risk: 'medium' };
      return {
        ...base,
        verb: `Close as duplicate of #${target.number}`,
        duplicateOf: target.number,
        close: 'not_planned',
        risk: target.score > 0.5 ? 'low' : 'medium',
        comment:
          `${hi} This looks like the same problem as #${target.number} (“${target.title}”) — both mention ${quoteList(target.sharedTerms.slice(0, 3))}.\n\n` +
          `Closing in favour of #${target.number} so the discussion stays in one place; please add a 👍 and any extra details there. ` +
          `If your case is different, reply here and we'll reopen.`,
      };
    }
    case 'needs-repro': {
      const missing: string[] = [];
      if (!f.reproLink) missing.push('a minimal reproduction (a StackBlitz link or a small GitHub repo)');
      if (!f.stepsToReproduce) missing.push('the exact steps to trigger it');
      if (!f.versionInfo) missing.push('your versions (`npx envinfo --system --npmPackages --binaries`)');
      if (!missing.length) missing.push('a smaller reproduction that isolates the problem');
      return {
        ...base,
        verb: 'Ask for a reproduction',
        risk: 'low',
        comment: `${hi} To investigate we need:\n\n${missing.map((m) => `- ${m}`).join('\n')}\n\nIssues without a reproduction are hard to act on, so this will be closed automatically if we don't hear back in a few weeks.`,
      };
    }
    case 'question':
      return {
        ...base,
        verb: 'Redirect to Discussions and close',
        close: 'not_planned',
        risk: 'low',
        comment: `${hi} This reads like a usage question rather than a bug, so GitHub Discussions (or the community chat) will get you a faster answer from more people: https://github.com/${ctx.repo}/discussions\n\nClosing here to keep the tracker focused on bugs — if it turns out to be a bug, reopen with a reproduction.`,
      };
    case 'feature': {
      const area = inferAreaLabel(issue, ctx.repoLabels);
      return { ...base, addLabels: area ? [label, area] : [label], verb: `Label as feature request${area ? ` · ${area}` : ''}`, risk: 'low' };
    }
    case 'bug-ready': {
      const area = inferAreaLabel(issue, ctx.repoLabels);
      return { ...base, addLabels: area ? [label, area] : [label], verb: `Accept as bug${area ? ` · route to ${area}` : ''}`, risk: 'low' };
    }
    case 'regression': {
      const area = inferAreaLabel(issue, ctx.repoLabels);
      const bug = resolveLabel('bug-ready', ctx.repoLabels).name;
      return {
        ...base,
        addLabels: [label, bug, ...(area ? [area] : [])],
        verb: 'Flag as regression — bisect before next release',
        risk: 'medium',
        comment: `${hi} Marking this as a regression. If you can, please confirm the last version where it worked — that lets us bisect quickly.`,
      };
    }
    case 'security':
      return {
        ...base,
        verb: 'Escalate to security — move out of public tracker',
        risk: 'high',
        comment: `${hi} This may have security impact, so we'd like to handle it privately. Please report the details through the repository's security policy (https://github.com/${ctx.repo}/security) and avoid posting exploit details here.`,
      };
    case 'docs':
      return { ...base, verb: 'Label as docs — good first issue candidate', risk: 'low' };
    case 'stale':
      return {
        ...base,
        addLabels: [],
        verb: 'Close as stale',
        close: 'not_planned',
        risk: 'medium',
        comment: `Closing because there hasn't been activity for a while. If this still happens on the latest version, please open a new issue with a reproduction and link back here.`,
      };
  }
}

function quoteList(terms: string[]): string {
  const q = terms.map((t) => `“${t}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}` : q[0] ?? 'the same symptoms';
}

function pickDuplicateTarget(issue: Issue, similar: SimilarMatch[]): SimilarMatch | undefined {
  // Prefer the older issue so the newer one is closed, and ignore matches that were closed as not planned.
  return similar.find((s) => s.number !== issue.number && s.score > 0.22 && (s.state === 'open' ? s.number < issue.number : true));
}
