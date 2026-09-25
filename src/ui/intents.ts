import type { IntentId } from '../engine';

export const INTENT_META: Record<IntentId, { name: string; ask: string; tone: string; dot: string }> = {
  security: { name: 'Security report', ask: 'a security report', tone: 'text-rose-300 bg-rose-500/10 ring-rose-500/30', dot: 'bg-rose-400' },
  regression: { name: 'Regression', ask: 'a regression', tone: 'text-orange-300 bg-orange-500/10 ring-orange-500/30', dot: 'bg-orange-400' },
  duplicate: { name: 'Duplicate', ask: 'a duplicate', tone: 'text-violet-300 bg-violet-500/10 ring-violet-500/30', dot: 'bg-violet-400' },
  'needs-repro': { name: 'Needs a reproduction', ask: 'missing a reproduction', tone: 'text-amber-300 bg-amber-500/10 ring-amber-500/30', dot: 'bg-amber-400' },
  'bug-ready': { name: 'Actionable bug', ask: 'an actionable bug', tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30', dot: 'bg-emerald-400' },
  question: { name: 'Usage question', ask: 'a usage question', tone: 'text-sky-300 bg-sky-500/10 ring-sky-500/30', dot: 'bg-sky-400' },
  feature: { name: 'Feature request', ask: 'a feature request', tone: 'text-indigo-300 bg-indigo-500/10 ring-indigo-500/30', dot: 'bg-indigo-400' },
  docs: { name: 'Docs fix', ask: 'a docs fix', tone: 'text-teal-300 bg-teal-500/10 ring-teal-500/30', dot: 'bg-teal-400' },
  stale: { name: 'Stale', ask: 'stale', tone: 'text-zinc-300 bg-zinc-500/10 ring-zinc-500/30', dot: 'bg-zinc-400' },
};

export function ago(iso: string, now = Date.now()): string {
  const d = (now - new Date(iso).getTime()) / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h ago`;
  if (d < 45) return `${Math.round(d)}d ago`;
  if (d < 400) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
