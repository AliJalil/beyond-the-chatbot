import { useState } from 'react';
import type { Decision } from '../../engine';
import { INTENT_META, pct } from '../intents';
import type { Triage } from '../useTriage';

/** Actions the interface prepared on its own. Nothing here is applied until a human approves it. */
export function StagedTray({ t }: { t: Triage }) {
  const [open, setOpen] = useState<number | null>(null);
  const items = t.stagedDecisions;
  if (!items.length) return null;
  return (
    <aside className="w-full rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4 lg:w-80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-emerald-200">Prepared for you</div>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {items.length} routine action{items.length > 1 ? 's' : ''} I'm confident about. Nothing is sent until you approve.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((d) => (
          <StagedItem key={d.issue.number} d={d} t={t} open={open === d.issue.number} toggle={() => setOpen(open === d.issue.number ? null : d.issue.number)} />
        ))}
      </ul>
      <button onClick={() => t.approveAllStaged()} className="mt-3 w-full rounded-lg bg-emerald-400/15 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/25 hover:bg-emerald-400/25">
        Approve all {items.length}
      </button>
    </aside>
  );
}

function StagedItem({ d, t, open, toggle }: { d: Decision; t: Triage; open: boolean; toggle: () => void }) {
  const h = d.hypotheses[0];
  return (
    <li className="rounded-lg bg-black/20 ring-1 ring-white/5">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${INTENT_META[h.intent].dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-zinc-200">{h.action.verb}</span>
          <span className="block truncate text-[11px] text-zinc-500">
            #{d.issue.number} {d.issue.title}
          </span>
        </span>
        <span className="text-[11px] text-zinc-500">{pct(d.confidence)}</span>
      </button>
      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2">
          <ul className="space-y-1 text-[12px] text-zinc-400">
            {h.evidence.map((e) => (
              <li key={e.feature}>· {e.label}</li>
            ))}
          </ul>
          {h.action.comment && <p className="mt-2 line-clamp-4 whitespace-pre-wrap rounded bg-zinc-950/60 p-2 text-[12px] text-zinc-500">{h.action.comment}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => t.approve(d, h.action, 'autopilot')} className="rounded-md bg-emerald-400/90 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-300">
              Approve
            </button>
            <button onClick={() => t.rejectStaged(d)} className="rounded-md px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/10 hover:bg-white/5">
              Wrong — let me decide
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
