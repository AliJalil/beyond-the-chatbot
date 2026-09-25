import { useCallback, useState } from 'react';
import { ledgerStats } from '../engine';
import { ConnectDialog, Header, LedgerDrawer, Toasts, type View } from './components/Chrome';
import { DecisionCard, Kbd } from './components/DecisionCard';
import { StagedTray } from './components/StagedTray';
import { HowView, ReplacesView } from './components/Views';
import { INTENT_META } from './intents';
import { useTriage } from './useTriage';

export default function App() {
  const t = useTriage();
  const [view, setView] = useState<View>('work');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const lookup = useCallback((n: number) => t.data?.open.find((i) => i.number === n) ?? t.data?.closed.find((i) => i.number === n), [t.data]);

  if (!t.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-400">{t.status}</p>
        </div>
      </div>
    );
  }

  const current = t.current;
  const upNext = t.queue.slice(1, 4);
  const handled = t.ledger.filter((e) => !e.undone).length;

  return (
    <div className="min-h-screen">
      <Header t={t} view={view} setView={setView} openLedger={() => setLedgerOpen(true)} openConnect={() => setConnectOpen(true)} />

      {view === 'replaces' && <ReplacesView t={t} />}
      {view === 'how' && <HowView t={t} />}

      {view === 'work' && (
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">
          <Briefing t={t} />
          {current || t.stagedDecisions.length ? (
            <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row lg:justify-center">
              <div className="flex w-full max-w-2xl flex-col items-center">
                {current ? (
                  <DecisionCard key={`${current.issue.number}-${current.hypotheses[0].intent}-${current.abstain}-${t.rejected[current.issue.number] ?? ''}`} t={t} d={current} lookup={lookup} />
                ) : (
                  <div className="w-full rounded-2xl border border-white/10 p-8 text-center text-zinc-400">Only the prepared actions are left — review them on the right.</div>
                )}
                {upNext.length > 0 && (
                  <div className="mt-4 flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-zinc-600">
                    <span>Up next</span>
                    {upNext.map((d) => (
                      <span key={d.issue.number} className="flex max-w-[14rem] items-center gap-1.5 truncate">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.abstain ? 'bg-amber-300' : INTENT_META[d.hypotheses[0].intent].dot}`} />
                        <span className="truncate">{d.issue.title}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <StagedTray t={t} />
            </div>
          ) : (
            <Done t={t} handled={handled} openLedger={() => setLedgerOpen(true)} />
          )}
        </main>
      )}

      {ledgerOpen && <LedgerDrawer t={t} onClose={() => setLedgerOpen(false)} />}
      {connectOpen && <ConnectDialog t={t} onClose={() => setConnectOpen(false)} />}
      <Toasts t={t} />
    </div>
  );
}

function Briefing({ t }: { t: ReturnType<typeof useTriage> }) {
  const data = t.data!;
  const asks = t.queue.filter((d) => d.abstain).length;
  const first = t.ledger.length === 0;
  return (
    <div className="mx-auto max-w-2xl text-center lg:max-w-none">
      {first ? (
        <p className="text-balance text-sm text-zinc-400">
          I read <b className="text-zinc-200">{data.open.length} open issues</b> in {data.repo}
          {data.source === 'sample' && ' (built-in sample)'}.{' '}
          {t.stagedDecisions.length > 0 && (
            <>
              <b className="text-emerald-300">{t.stagedDecisions.length} routine actions are prepared</b> for your approval.{' '}
            </>
          )}
          <b className="text-zinc-200">{t.queue.length} need your judgement</b>
          {asks > 0 && <> ({asks} I'm unsure about)</>}, most urgent first. <span className="hidden sm:inline">Keys: <Kbd>⏎</Kbd> do it <Kbd>N</Kbd> not this <Kbd>S</Kbd> later</span>
        </p>
      ) : t.focus ? (
        <p className="text-sm text-indigo-300/80">
          You've handled {t.focus.streak} {INTENT_META[t.focus.intent].name.toLowerCase()} decisions in a row — similar ones come first.
        </p>
      ) : null}
    </div>
  );
}

function Done({ t, handled, openLedger }: { t: ReturnType<typeof useTriage>; handled: number; openLedger: () => void }) {
  const s = ledgerStats(t.ledger);
  const mins = Math.max(1, Math.round((Date.now() - t.startedAt) / 60000));
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="text-4xl">✓</div>
      <h2 className="mt-4 text-2xl font-semibold text-white">Tracker triaged</h2>
      <p className="mt-2 text-zinc-400">
        {handled} decisions in ~{mins} min. The first guess matched your call {s.total - s.corrected}/{s.total} times; {s.byAutopilot} were prepared before you asked.
      </p>
      <button onClick={openLedger} className="mt-6 rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
        Review history & export
      </button>
    </div>
  );
}
