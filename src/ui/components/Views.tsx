import { useMemo } from 'react';
import { FEATURE_LABELS, INTENTS, type Decision, type FeatureId } from '../../engine';
import { FEATURES } from '../../engine/model';
import { ago, INTENT_META, pct } from '../intents';
import type { Triage } from '../useTriage';

/** Side by side: the dashboard + chatbot this replaces, built from the same data. */
export function ReplacesView({ t }: { t: Triage }) {
  const data = t.data!;
  const n = data.open.length;
  const labelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of data.open) for (const l of i.labels.length ? i.labels : ['(no label)']) m.set(l, (m.get(l) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [data]);
  const max = labelCounts[0]?.[1] ?? 1;
  const unlabeled = data.open.filter((i) => !i.labels.length || i.labels.every((l) => /triage/i.test(l))).length;
  const hot = [...data.open].sort((a, b) => b.comments + b.reactions - (a.comments + a.reactions)).slice(0, 3);
  const staged = t.stagedDecisions.length;
  const humanCards = t.queue.length;
  const top = t.queue[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* BEFORE */}
        <section>
          <Caption tone="before" title="Before: dashboard + “Ask AI”" sub={`Everything, all the time. You work out what matters.`} />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-100 text-zinc-800">
            <div className="flex items-center gap-2 border-b border-zinc-300 bg-white px-3 py-2 text-xs">
              <span className="rounded border border-zinc-300 px-2 py-0.5">is:issue is:open</span>
              <span className="rounded border border-zinc-300 px-2 py-0.5">Labels ▾</span>
              <span className="rounded border border-zinc-300 px-2 py-0.5">Assignee ▾</span>
              <span className="rounded border border-zinc-300 px-2 py-0.5">Sort ▾</span>
              <span className="ml-auto text-zinc-500">{n} open</span>
            </div>
            <div className="grid grid-cols-4 gap-2 border-b border-zinc-300 p-3 text-center text-[11px]">
              {[
                ['Open', n],
                ['Untriaged', unlabeled],
                ['Avg age', `${Math.round(data.open.reduce((s, i) => s + (Date.now() - +new Date(i.createdAt)) / 864e5, 0) / Math.max(1, n))}d`],
                ['Comments', data.open.reduce((s, i) => s + i.comments, 0)],
              ].map(([k, v]) => (
                <div key={k} className="rounded bg-white p-2 shadow-sm">
                  <div className="text-lg font-semibold">{v}</div>
                  <div className="text-zinc-500">{k}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-b border-zinc-300 p-3">
              {labelCounts.map(([l, c]) => (
                <div key={l} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 truncate text-zinc-600">{l}</span>
                  <span className="h-2 rounded bg-zinc-400" style={{ width: `${(c / max) * 60}%` }} />
                  <span className="text-zinc-500">{c}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_190px]">
              <table className="block max-h-72 overflow-y-auto text-[11px]">
                <tbody className="block">
                  {data.open.slice(0, 40).map((i) => (
                    <tr key={i.number} className="flex gap-2 border-b border-zinc-200 px-3 py-1.5">
                      <td className="text-zinc-400">#{i.number}</td>
                      <td className="flex-1 truncate">{i.title}</td>
                      <td className="text-zinc-400">{ago(i.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col border-l border-zinc-300 bg-white p-2 text-[11px]">
                <div className="font-semibold">✨ Ask AI</div>
                <div className="mt-2 self-end rounded bg-zinc-200 px-2 py-1">What should I work on?</div>
                <div className="mt-2 rounded bg-zinc-100 px-2 py-1 leading-snug text-zinc-600">
                  Great question! There are {n} open issues. {unlabeled} haven't been triaged yet. The most discussed are {hot.map((h) => `#${h.number}`).join(', ')}. You may want to consider prioritizing bugs over feature requests, checking whether issues include a reproduction, and closing duplicates. Would you like me to summarize any of these issues?
                </div>
                <div className="mt-auto rounded border border-zinc-300 px-2 py-1 text-zinc-400">Ask anything…</div>
              </div>
            </div>
          </div>
          <Facts
            rows={[
              ['You decide', `what to look at, across ${n} rows`],
              ['Per issue', 'open → read → label → type reply → close'],
              ['≈ effort', `${n * 6} clicks, ~${Math.round(n * 2.5)} min`],
              ['The AI', 'answers when asked, then forgets'],
            ]}
          />
        </section>

        {/* AFTER */}
        <section>
          <Caption tone="after" title="After: Next Move" sub="One decision at a time, with the reason and a ready action." />
          <div className="rounded-2xl border border-emerald-400/20 bg-zinc-900 p-5">
            {top ? <MiniCard d={top} /> : <div className="p-6 text-center text-zinc-500">Queue is empty.</div>}
            {staged > 0 && (
              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] px-4 py-3 text-sm text-emerald-200">
                + {staged} routine actions already prepared · approve in one click
              </div>
            )}
          </div>
          <Facts
            rows={[
              ['It decides', `what needs you: ${humanCards} cards, most urgent first`],
              ['Per issue', 'read the reason → ⏎'],
              ['≈ effort', `${humanCards + (staged ? 1 : 0)} keystrokes, ~${t.minutesLeft} min`],
              ['The AI', 'acts first, learns from every correction'],
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function Caption({ tone, title, sub }: { tone: 'before' | 'after'; title: string; sub: string }) {
  return (
    <div className="mb-3">
      <div className={`text-xs font-semibold uppercase tracking-widest ${tone === 'before' ? 'text-zinc-500' : 'text-emerald-400'}`}>{tone}</div>
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="text-sm text-zinc-500">{sub}</div>
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="text-zinc-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function MiniCard({ d }: { d: Decision }) {
  const h = d.hypotheses[0];
  return (
    <div className="rounded-xl bg-zinc-950/60 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 ring-1 ${INTENT_META[h.intent].tone}`}>{d.abstain ? 'Not sure — asks you' : INTENT_META[h.intent].name}</span>
        <span className="text-zinc-500">{pct(h.prob)} sure · #{d.issue.number}</span>
      </div>
      <div className="mt-2 font-medium text-white">{d.issue.title}</div>
      <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
        {h.evidence.map((e) => (
          <li key={e.feature}>· {e.label}</li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="rounded-md bg-emerald-400 px-2 py-1 font-semibold text-zinc-950">{h.action.verb} ⏎</span>
        <span className="text-zinc-500">Not this · Later</span>
      </div>
    </div>
  );
}

/** The architecture, shown live: data → intent inference → surfaced decision → action. */
export function HowView({ t }: { t: Triage }) {
  const data = t.data!;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of t.decisions) m.set(d.hypotheses[0].intent, (m.get(d.hypotheses[0].intent) ?? 0) + 1);
    return m;
  }, [t.decisions]);
  const abstained = t.decisions.filter((d) => d.abstain).length;
  const handled = t.ledger.filter((e) => !e.undone);
  const steps = [
    { k: 'Data', v: `${data.open.length} open + ${data.closed.length} recently closed issues, ${data.labels.length} repo labels`, s: `${data.source} · ${ago(data.fetchedAt)}` },
    { k: 'Intent inference', v: `${FEATURES.length - 1} explainable signals per issue + TF-IDF similarity → a logistic model over ${INTENTS.length} intents`, s: `${t.modelUpdates} online updates from your calls` },
    { k: 'Surfaced decision', v: `${t.decisions.length - abstained} confident cards, ${abstained} “which is it?” cards, ${t.stagedDecisions.length} prepared unasked`, s: 'ordered by urgency × traction × confidence' },
    { k: 'Action', v: `${handled.length} approved through the ledger (${handled.filter((e) => e.corrected).length} corrected)`, s: t.token ? 'applied on GitHub, undoable' : 'dry run → gh CLI script' },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h2 className="text-xl font-semibold text-white">How it decides</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">No chat, no prompt. The interface reads the tracker, forms a belief about what each issue needs, and shows you only the decision — with its reasons, so a wrong guess is obvious and cheap to fix.</p>
      <ol className="mt-6 grid gap-3 md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.k} className="relative rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              {i + 1}. {s.k}
            </div>
            <div className="mt-2 text-sm text-zinc-200">{s.v}</div>
            <div className="mt-2 text-xs text-zinc-500">{s.s}</div>
            {i < 3 && <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-zinc-600 md:block">→</span>}
          </li>
        ))}
      </ol>

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">What this repo looks like to the model</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {INTENTS.map((k) => (
          <span key={k} className={`rounded-full px-3 py-1 text-sm ring-1 ${INTENT_META[k].tone}`}>
            {INTENT_META[k].name} · {counts.get(k) ?? 0}
          </span>
        ))}
      </div>

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">When it guesses wrong</h3>
      <ul className="mt-3 grid gap-3 text-sm text-zinc-300 md:grid-cols-2">
        {[
          ['It asks instead of guessing', 'If the top two readings are within 12 points, or the best is under 45%, the card becomes “which is it?”.'],
          ['“Not this” is one key', 'N shows the ranked alternatives with their evidence; pick one with 1–9. The draft action updates.'],
          ['It learns immediately', 'Each correction is a gradient step on the model. The rest of the queue is re-read and you’re told what changed.'],
          ['Everything is reversible', 'Undo from the toast or History. Undoing the latest action also rolls back what the model learned from it.'],
          ['Autopilot is conservative', 'Only low-risk intents above 72% (and 35 points clear of the next) are prepared, never applied. Security is always a human call.'],
          ['Rejecting a prepared action', '“Wrong — let me decide” moves it to your queue and lowers that reading for similar issues.'],
        ].map(([a, b]) => (
          <li key={a} className="rounded-xl border border-white/5 p-4">
            <div className="font-medium text-white">{a}</div>
            <div className="mt-1 text-zinc-500">{b}</div>
          </li>
        ))}
      </ul>

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">Signals</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(FEATURE_LABELS) as FeatureId[])
          .filter((f) => f !== 'bias')
          .map((f) => (
            <span key={f} className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">
              {FEATURE_LABELS[f]}
            </span>
          ))}
      </div>
    </div>
  );
}
