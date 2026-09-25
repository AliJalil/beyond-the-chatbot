// Session layer: infers what the *maintainer* is doing right now (not just what each issue needs),
// orders the queue accordingly, and decides which actions the interface may prepare on its own.

import type { Decision, IntentId, LedgerEntry } from './types';

export interface SessionFocus {
  intent: IntentId;
  streak: number;
  reason: string;
}

/**
 * If the maintainer approved the same kind of action several times in a row, they are "in a mode"
 * (e.g. clearing duplicates). Surfacing more of the same keeps them in flow.
 */
export function inferFocus(ledger: LedgerEntry[]): SessionFocus | undefined {
  const recent = ledger.filter((e) => !e.undone && e.actor === 'human').slice(-5).reverse();
  if (recent.length < 2) return undefined;
  const intent = recent[0].action.intent;
  let streak = 0;
  for (const e of recent) {
    if (e.action.intent !== intent) break;
    streak++;
  }
  if (streak < 2) return undefined;
  return { intent, streak, reason: `You've handled ${streak} “${intent}” decisions in a row — similar ones are pulled forward.` };
}

/** Skipped cards are not lost — they go to the back of the line. */
export function orderQueue(decisions: Decision[], done: Set<number>, skipped: number[], staged: Set<number>, focus?: SessionFocus): Decision[] {
  const skipRank = new Map(skipped.map((n, i) => [n, i]));
  return decisions
    .filter((d) => !done.has(d.issue.number) && !staged.has(d.issue.number))
    .map((d) => {
      let p = d.priority;
      if (focus && d.hypotheses[0].intent === focus.intent && !d.abstain) p += 0.5;
      if (skipRank.has(d.issue.number)) p -= 10 + skipRank.get(d.issue.number)! * 0.01;
      return { d, p };
    })
    .sort((a, b) => b.p - a.p)
    .map(({ d }) => d);
}

export interface AutopilotPolicy {
  threshold: number; // minimum confidence
  minMargin: number;
  intents: IntentId[]; // which kinds of action the interface may prepare unasked
}

export const DEFAULT_AUTOPILOT: AutopilotPolicy = {
  threshold: 0.72,
  minMargin: 0.35,
  // Closing a question or a stale issue is left to a human: it ends a conversation with a person.
  intents: ['duplicate', 'needs-repro', 'docs', 'feature'],
};

/**
 * Actions the interface initiates on its own. They are *staged*, never applied:
 * a human approves or rejects each (or the batch). High-risk intents are never staged.
 */
export function selectForAutopilot(decisions: Decision[], done: Set<number>, policy: AutopilotPolicy = DEFAULT_AUTOPILOT): Decision[] {
  return decisions.filter((d) => {
    const top = d.hypotheses[0];
    return (
      !done.has(d.issue.number) &&
      !d.abstain &&
      top.action.risk !== 'high' &&
      policy.intents.includes(top.intent) &&
      d.confidence >= policy.threshold &&
      d.margin >= policy.minMargin &&
      (top.intent !== 'duplicate' || top.action.duplicateOf !== undefined)
    );
  });
}

/** Rough time estimate shown in the header: 20s per confident card, 45s per uncertain one. */
export function estimateMinutes(queue: Decision[]): number {
  const s = queue.reduce((acc, d) => acc + (d.abstain ? 45 : 20), 0);
  return Math.max(1, Math.round(s / 60));
}
