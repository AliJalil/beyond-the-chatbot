import { useState } from 'react';
import { ledgerStats, parseRepo, toGhScript } from '../../engine';
import { INTENT_META } from '../intents';
import type { Triage } from '../useTriage';

export type View = 'work' | 'replaces' | 'how';

export function Header({ t, view, setView, openLedger, openConnect }: { t: Triage; view: View; setView: (v: View) => void; openLedger: () => void; openConnect: () => void }) {
  const total = t.decisions.length;
  const handled = t.ledger.filter((e) => !e.undone).length;
  const stats = ledgerStats(t.ledger);
  const src = t.data?.source;
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 lg:flex-nowrap">
        <button onClick={() => setView('work')} className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold text-white">
          <svg viewBox="0 0 32 32" className="h-6 w-6">
            <rect width="32" height="32" rx="8" fill="#18181b" />
            <path d="M10 16h10m-4-5 5 5-5 5" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Next Move
        </button>
        <button onClick={openConnect} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 font-mono text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-white/5" title="Change repository">
          {t.data?.repo ?? '…'}
          {src && src !== 'live' && <span className={`rounded px-1 font-sans text-[10px] uppercase ${src === 'sample' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/10 text-zinc-400'}`}>{src}</span>}
          {t.token && <span className="rounded bg-emerald-400/15 px-1 font-sans text-[10px] uppercase text-emerald-300">live writes</span>}
        </button>
        {total > 0 && (
          <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-xs text-zinc-500">
            <span className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full bg-emerald-400 transition-all" style={{ width: `${(handled / total) * 100}%` }} />
            </span>
            <span>
              {t.queue.length} decision{t.queue.length === 1 ? '' : 's'} left · ~{t.minutesLeft} min
            </span>
            {stats.total > 0 && (
              <span className="hidden xl:inline" title="How often the first guess matched your call">
                · first guess right {stats.total - stats.corrected}/{stats.total}
              </span>
            )}
          </div>
        )}
        <nav className="ml-auto flex shrink-0 items-center gap-1 text-sm">
          <Tab on={view === 'replaces'} onClick={() => setView(view === 'replaces' ? 'work' : 'replaces')}>
            What this replaces
          </Tab>
          <Tab on={view === 'how'} onClick={() => setView(view === 'how' ? 'work' : 'how')}>
            How it decides
          </Tab>
          <Tab on={false} onClick={openLedger}>
            History{handled ? ` · ${handled}` : ''}
          </Tab>
        </nav>
      </div>
    </header>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1.5 ${on ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>
      {children}
    </button>
  );
}

export function LedgerDrawer({ t, onClose }: { t: Triage; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const script = t.data ? toGhScript(t.data.repo, t.ledger) : '';
  const download = () => {
    const url = URL.createObjectURL(new Blob([script], { type: 'text/x-shellscript' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `next-move-${t.data?.repo.replace('/', '-')}.sh` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const localCount = t.ledger.filter((e) => !e.undone && e.applied === 'local').length;
  return (
    <Overlay onClose={onClose} side>
      <h3 className="text-lg font-semibold text-white">History</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Every action goes through this ledger. {t.token ? 'Actions were applied on GitHub; undo reverses them there too.' : 'Dry-run mode: nothing was sent to GitHub. Export the reviewed actions as a GitHub CLI script, or connect a token to apply them directly.'}
      </p>
      <ul className="mt-4 space-y-2">
        {[...t.ledger].reverse().map((e) => (
          <li key={e.id} className={`rounded-lg p-3 ring-1 ring-white/5 ${e.undone ? 'opacity-40' : 'bg-white/[0.02]'}`}>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-1.5 w-1.5 rounded-full ${INTENT_META[e.action.intent].dot}`} />
              <span className="flex-1 text-zinc-200">{e.action.verb}</span>
              {!e.undone && (
                <button onClick={() => t.undo(e.id)} className="text-xs text-zinc-400 hover:text-white">
                  Undo
                </button>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-500">
              #{e.issue} {e.issueTitle}
            </div>
            <div className="mt-1 text-[11px] text-zinc-600">
              {e.actor === 'autopilot' ? 'prepared by Next Move, approved by you' : 'your decision'}
              {e.corrected && ` · corrected first guess (${INTENT_META[e.predicted].name})`}
              {e.undone && ' · undone'}
            </div>
          </li>
        ))}
        {!t.ledger.length && <li className="text-sm text-zinc-600">Nothing yet.</li>}
      </ul>
      {localCount > 0 && (
        <div className="mt-5 flex gap-2">
          <button onClick={download} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
            Download gh script ({localCount})
          </button>
          <button
            onClick={() => navigator.clipboard?.writeText(script).then(() => setCopied(true))}
            className="rounded-lg px-3 py-2 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-white/5"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <button onClick={t.resetLearning} className="mt-6 text-xs text-zinc-600 hover:text-zinc-300">
        Reset what the model learned for this repo ({t.modelUpdates} updates this session)
      </button>
    </Overlay>
  );
}

export function ConnectDialog({ t, onClose }: { t: Triage; onClose: () => void }) {
  const [repo, setRepo] = useState(t.data?.repo ?? '');
  const [token, setToken] = useState(t.token);
  const parsed = parseRepo(repo);
  const go = async () => {
    t.setToken(token.trim());
    if (parsed && parsed !== t.data?.repo) await t.loadRepo(parsed);
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-white">Triage another repository</h3>
      <p className="mt-1 text-sm text-zinc-500">Any public GitHub repo. Issues are read live from the GitHub API in your browser.</p>
      <label className="mt-4 block text-xs uppercase tracking-wide text-zinc-500">Repository</label>
      <input
        autoFocus
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && parsed && go()}
        placeholder="owner/name or a GitHub URL"
        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/50"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {['vitejs/vite', 'facebook/react-native', 'tailwindlabs/tailwindcss', 'vercel/next.js', 'spring-projects/spring-boot'].map((r) => (
          <button key={r} onClick={() => setRepo(r)} className="rounded-full px-2 py-0.5 font-mono text-[11px] text-zinc-400 ring-1 ring-white/10 hover:text-white">
            {r}
          </button>
        ))}
      </div>
      <label className="mt-5 block text-xs uppercase tracking-wide text-zinc-500">GitHub token (optional)</label>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Only if you maintain the repo and want actions applied directly"
        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/50"
      />
      <p className="mt-1 text-xs text-zinc-600">Kept in memory for this tab only — never stored or sent anywhere except api.github.com. Without it, everything runs as a dry run you can export.</p>
      <div className="mt-5 flex gap-2">
        <button disabled={!parsed || t.busy} onClick={go} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40">
          {t.busy ? t.status : 'Load'}
        </button>
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white">
          Cancel
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose, side }: { children: React.ReactNode; onClose: () => void; side?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex bg-black/60 backdrop-blur-sm" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={side ? 'ml-auto h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-zinc-950 p-6' : 'm-auto w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6'}
      >
        {children}
      </div>
    </div>
  );
}

export function Toasts({ t }: { t: Triage }) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4 lg:left-auto lg:right-6 lg:translate-x-0 lg:px-0">
      {t.toasts.map((x) => (
        <div
          key={x.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-xl ring-1 backdrop-blur ${
            x.tone === 'learn' ? 'bg-indigo-950/90 text-indigo-100 ring-indigo-400/30' : x.tone === 'error' ? 'bg-rose-950/90 text-rose-100 ring-rose-400/30' : 'bg-zinc-900/95 text-zinc-200 ring-white/10'
          }`}
        >
          <span className="flex-1">{x.text}</span>
          {x.undoId && (
            <button onClick={() => (t.undo(x.undoId!), t.dismissToast(x.id))} className="font-medium text-white underline-offset-2 hover:underline">
              Undo
            </button>
          )}
          <button onClick={() => t.dismissToast(x.id)} className="text-zinc-500 hover:text-white" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
