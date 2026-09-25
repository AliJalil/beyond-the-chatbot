// Every approved action is recorded here. Nothing reaches GitHub except through this ledger,
// which is what makes undo, export and "what did the system do?" answerable.

import type { Actor, Decision, IntentId, LedgerEntry, ProposedAction } from './types';

let seq = 0;
export function makeEntry(decision: Decision, action: ProposedAction, actor: Actor, applied: 'local' | 'github' = 'local'): LedgerEntry {
  const predicted: IntentId = decision.hypotheses[0].intent;
  return {
    id: `${Date.now().toString(36)}-${(seq++).toString(36)}`,
    at: new Date().toISOString(),
    issue: decision.issue.number,
    issueTitle: decision.issue.title,
    action,
    actor,
    predicted,
    corrected: action.intent !== predicted,
    applied,
    undone: false,
  };
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Shell script using the official GitHub CLI; review it, then run it to apply the session. */
export function toGhScript(repo: string, ledger: LedgerEntry[]): string {
  const live = ledger.filter((e) => !e.undone && e.applied === 'local');
  const lines = [
    '#!/usr/bin/env bash',
    `# Next Move — ${live.length} reviewed triage actions for ${repo}`,
    `# Generated ${new Date().toISOString()}. Requires the GitHub CLI (gh auth login).`,
    'set -euo pipefail',
    '',
  ];
  for (const e of live) {
    const a = e.action;
    lines.push(`# #${e.issue} ${e.issueTitle.replace(/\n/g, ' ')} → ${a.verb}${e.actor === 'autopilot' ? ' (prepared by Next Move, approved by you)' : ''}`);
    if (a.addLabels.length || a.removeLabels.length) {
      const add = a.addLabels.map((l) => `--add-label ${q(l)}`).join(' ');
      const rm = a.removeLabels.map((l) => `--remove-label ${q(l)}`).join(' ');
      lines.push(`gh issue edit ${e.issue} --repo ${repo} ${add} ${rm}`.trim());
    }
    if (a.close) {
      const reason = a.close === 'completed' ? 'completed' : 'not planned';
      lines.push(`gh issue close ${e.issue} --repo ${repo} --reason ${q(reason)}${a.comment ? ` --comment ${q(a.comment)}` : ''}`);
    } else if (a.comment) {
      lines.push(`gh issue comment ${e.issue} --repo ${repo} --body ${q(a.comment)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function ledgerStats(ledger: LedgerEntry[]) {
  const live = ledger.filter((e) => !e.undone);
  return {
    total: live.length,
    corrected: live.filter((e) => e.corrected).length,
    byAutopilot: live.filter((e) => e.actor === 'autopilot').length,
    accuracy: live.length ? 1 - live.filter((e) => e.corrected).length / live.length : 1,
  };
}
