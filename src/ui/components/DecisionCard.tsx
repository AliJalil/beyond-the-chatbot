import { useEffect, useMemo, useState } from 'react';
import type { Decision, Hypothesis, IntentId, Issue, ProposedAction } from '../../engine';
import { ago, INTENT_META, pct } from '../intents';
import type { Triage } from '../useTriage';

interface Props {
  t: Triage;
  d: Decision;
  lookup: (n: number) => Issue | undefined;
}

type Mode = 'card' | 'alternatives' | 'edit';

export function DecisionCard({ t, d, lookup }: Props) {
  const rejectedIntent = t.rejected[d.issue.number];
  const [mode, setMode] = useState<Mode>(d.abstain || rejectedIntent ? 'alternatives' : 'card');
  const [chosen, setChosen] = useState<Hypothesis>(d.hypotheses[0]);
  const [draft, setDraft] = useState<ProposedAction>(d.hypotheses[0].action);
  const meta = INTENT_META[chosen.intent];

  const pick = (h: Hypothesis) => {
    setChosen(h);
    setDraft(h.action);
    setMode('card');
  };
  const doIt = () => t.approve(d, draft);
  const notThis = () => setMode('alternatives');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (mode === 'alternatives') {
        const i = Number(e.key) - 1;
        const opts = d.hypotheses;
        if (i >= 0 && i < opts.length) return pick(opts[i]);
        if (e.key === 'Escape') return setMode('card');
      }
      if (e.key === 'Enter' && mode !== 'alternatives') {
        e.preventDefault();
        doIt();
      } else if (e.key === 'n' || e.key === 'x') notThis();
      else if (e.key === 's' || e.key === 'ArrowRight') t.skip(d);
      else if (e.key === 'e') setMode('edit');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dupTarget = draft.duplicateOf ? lookup(draft.duplicateOf) : undefined;
  const alternatives = useMemo(() => d.hypotheses.filter((h) => h.intent !== rejectedIntent).slice(0, 6), [d, rejectedIntent]);

  return (
    <article className="relative w-full max-w-2xl animate-in rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
      {/* What the system thinks, and how sure it is */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {(d.abstain || rejectedIntent) && mode === 'alternatives' ? (
          <span className="rounded-full bg-amber-400/10 px-3 py-1 font-medium text-amber-200 ring-1 ring-amber-400/30">{rejectedIntent ? 'Your call' : "I'm not sure about this one"}</span>
        ) : (
          <span className={`rounded-full px-3 py-1 font-medium ring-1 ${meta.tone}`}>{meta.name}</span>
        )}
        <Confidence p={chosen.prob} human={chosen !== d.hypotheses[0]} />
        <span className="flex w-full flex-wrap items-center gap-x-2 text-zinc-500 sm:ml-auto sm:w-auto">
          <a href={d.issue.url} target="_blank" rel="noreferrer" className="font-mono text-zinc-400 hover:text-white">
            #{d.issue.number}
          </a>
          · @{d.issue.author} · {ago(d.issue.createdAt)}
          {d.issue.reactions + d.issue.comments > 0 && <span>· {d.issue.reactions}👍 {d.issue.comments}💬</span>}
        </span>
      </div>

      <h2 className="mt-5 text-balance text-xl font-semibold leading-snug text-white sm:text-[1.7rem]">{d.issue.title}</h2>
      {d.gist !== d.issue.title && <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">{d.gist}</p>}

      {mode === 'alternatives' ? (
        <Alternatives d={d} options={alternatives} rejected={rejectedIntent} onPick={pick} onCancel={d.abstain || rejectedIntent ? undefined : () => setMode('card')} />
      ) : (
        <>
          {/* Why */}
          <ul className="mt-6 space-y-2">
            {chosen.evidence.map((e) => (
              <li key={e.feature} className="flex gap-3 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="text-zinc-300">
                  {e.label}
                  {e.detail && <span className="ml-2 font-mono text-xs text-zinc-500">{e.detail}</span>}
                </span>
              </li>
            ))}
          </ul>

          {dupTarget && (
            <a href={dupTarget.url} target="_blank" rel="noreferrer" className="mt-5 block rounded-xl border border-violet-400/20 bg-violet-500/5 p-4 hover:border-violet-400/40">
              <div className="text-xs uppercase tracking-wider text-violet-300/80">
                Same as #{dupTarget.number} · {dupTarget.state === 'closed' ? 'closed' : 'open'} · {ago(dupTarget.createdAt)}
              </div>
              <div className="mt-1 font-medium text-zinc-100">{dupTarget.title}</div>
            </a>
          )}

          {/* The proposed action */}
          <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium text-white">{draft.verb}</span>
              {draft.risk !== 'low' && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-zinc-400">{draft.risk} risk</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.addLabels.map((l) => (
                <button key={`+${l}`} title="Remove" onClick={() => setDraft({ ...draft, addLabels: draft.addLabels.filter((x) => x !== l) })} className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-300 ring-1 ring-emerald-500/25 hover:line-through">
                  + {l}
                </button>
              ))}
              {draft.removeLabels.map((l) => (
                <span key={`-${l}`} className="rounded-full bg-zinc-500/10 px-2.5 py-0.5 font-mono text-xs text-zinc-400 ring-1 ring-zinc-500/25">
                  − {l}
                </span>
              ))}
              {draft.close && <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs text-rose-300 ring-1 ring-rose-500/25">close · {draft.close.replace('_', ' ')}</span>}
            </div>
            {draft.comment !== undefined &&
              (mode === 'edit' ? (
                <textarea
                  autoFocus
                  value={draft.comment}
                  onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                  rows={7}
                  className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed text-zinc-200 outline-none focus:border-emerald-400/50"
                />
              ) : (
                <button onClick={() => setMode('edit')} className="mt-3 block w-full whitespace-pre-wrap rounded-lg bg-zinc-950/60 p-3 text-left text-[13px] leading-relaxed text-zinc-400 hover:text-zinc-200" title="Click to edit (E)">
                  {draft.comment}
                </button>
              ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button onClick={doIt} className="rounded-xl bg-emerald-400 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-300">
              Do it <Kbd dark>⏎</Kbd>
            </button>
            <button onClick={notThis} className="rounded-xl px-4 py-2.5 text-zinc-300 ring-1 ring-white/10 hover:bg-white/5">
              Not this <Kbd>N</Kbd>
            </button>
            <button onClick={() => t.skip(d)} className="rounded-xl px-4 py-2.5 text-zinc-500 hover:text-zinc-300">
              Later <Kbd>S</Kbd>
            </button>
            {draft.comment !== undefined && mode !== 'edit' && (
              <button onClick={() => setMode('edit')} className="ml-auto text-sm text-zinc-500 hover:text-zinc-300">
                Edit reply <Kbd>E</Kbd>
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function Alternatives({ d, options, rejected, onPick, onCancel }: { d: Decision; options: Hypothesis[]; rejected?: IntentId; onPick: (h: Hypothesis) => void; onCancel?: () => void }) {
  const [a, b] = options;
  const close = d.abstain && !rejected;
  return (
    <div className="mt-6">
      <p className="text-sm text-zinc-400">
        {close ? (
          <>
            It reads as <b className="text-zinc-200">{INTENT_META[a.intent].ask}</b> or <b className="text-zinc-200">{INTENT_META[b.intent].ask}</b> — too close to call ({pct(a.prob)} vs {pct(b.prob)}). Which is it? I'll learn from your answer.
          </>
        ) : rejected ? (
          <>
            You turned down <b className="text-zinc-200">{INTENT_META[rejected].name.toLowerCase()}</b> for this one. What is it instead? I'll re-read the rest of the queue with your answer.
          </>
        ) : (
          <>What is it instead? Your pick is applied and the model re-reads the rest of the queue.</>
        )}
      </p>
      <div className="mt-4 grid gap-2">
        {options.map((h, i) => (
          <button key={h.intent} onClick={() => onPick(h)} className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition hover:border-white/25 hover:bg-white/5 ${i < 2 && close ? 'border-white/15 bg-white/[0.03]' : 'border-white/5'}`}>
            <Kbd>{i + 1}</Kbd>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${INTENT_META[h.intent].dot}`} />
                <span className="font-medium text-zinc-100">{INTENT_META[h.intent].name}</span>
                <span className="text-xs text-zinc-500">{pct(h.prob)}</span>
                <span className="ml-auto truncate text-xs text-zinc-500 group-hover:text-zinc-300">{h.action.verb}</span>
              </div>
              {h.evidence[0] && <div className="mt-1 truncate text-xs text-zinc-500">{h.evidence.map((e) => e.label).join(' · ')}</div>}
            </div>
          </button>
        ))}
      </div>
      {onCancel && (
        <button onClick={onCancel} className="mt-3 text-sm text-zinc-500 hover:text-zinc-300">
          ← back <Kbd>Esc</Kbd>
        </button>
      )}
    </div>
  );
}

function Confidence({ p, human }: { p: number; human: boolean }) {
  if (human) return <span className="text-xs text-zinc-400">your call</span>;
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-500" title="Model confidence">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-zinc-300" style={{ width: pct(p) }} />
      </span>
      {pct(p)} sure
    </span>
  );
}

export function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <kbd className={`ml-1.5 inline-block min-w-[1.4em] rounded px-1 text-center font-mono text-[11px] ${dark ? 'bg-black/15 text-zinc-800' : 'bg-white/10 text-zinc-400'}`}>{children}</kbd>;
}
