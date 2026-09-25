import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sampleDataset } from '../data/sample';
import {
  applyToGitHub,
  Corpus,
  estimateMinutes,
  fetchDataset,
  GitHubError,
  inferAll,
  inferFocus,
  IntentModel,
  makeEntry,
  orderQueue,
  rescore,
  selectForAutopilot,
  undoOnGitHub,
  type AppliedRef,
  type Actor,
  type Dataset,
  type Decision,
  type IntentId,
  type LedgerEntry,
  type ProposedAction,
  type Weights,
} from '../engine';
import { INTENT_META } from './intents';

export const DEFAULT_REPO = 'vitejs/vite';

export interface Toast {
  id: number;
  tone: 'learn' | 'info' | 'error' | 'ok';
  text: string;
  undoId?: string;
}

const store = {
  get<T>(k: string): T | undefined {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode: learning still works for this session */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
const modelKey = (repo: string) => `next-move:model:${repo}`;

async function loadInitial(onProgress: (m: string) => void): Promise<{ data: Dataset; note?: string }> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('sample')) return { data: sampleDataset() };
  const asked = params.get('repo');
  if (asked) {
    try {
      return { data: await fetchDataset(asked, { onProgress }) };
    } catch (e) {
      onProgress((e as Error).message);
    }
  }
  try {
    onProgress('Loading snapshot…');
    const res = await fetch('./snapshot.json', { cache: 'no-cache' });
    if (res.ok) {
      const snap = (await res.json()) as Dataset;
      if (!asked || snap.repo === asked) return { data: { ...snap, source: 'snapshot' } };
    }
  } catch {
    /* no snapshot in this build */
  }
  try {
    return { data: await fetchDataset(asked ?? DEFAULT_REPO, { onProgress }) };
  } catch (e) {
    return { data: sampleDataset(), note: `${(e as Error).message} Showing built-in sample data instead.` };
  }
}

export function useTriage() {
  const [data, setData] = useState<Dataset | null>(null);
  const [status, setStatus] = useState('Reading the tracker…');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<number[]>([]);
  const [staged, setStaged] = useState<number[]>([]);
  const [rejected, setRejected] = useState<Record<number, IntentId>>({});
  const [pinned, setPinned] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [token, setToken] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());

  const model = useRef(new IntentModel());
  const corpus = useRef<Corpus | null>(null);
  const applied = useRef(new Map<string, AppliedRef>());
  const weightsBefore = useRef(new Map<string, Weights>());
  const toastSeq = useRef(0);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts.slice(-1), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.undoId ? 9000 : 6000);
  }, []);
  const dismissToast = (id: number) => setToasts((ts) => ts.filter((x) => x.id !== id));

  const boot = useCallback(
    (d: Dataset, note?: string) => {
      const saved = store.get<{ weights: Weights; updates: number }>(modelKey(d.repo));
      model.current = saved ? IntentModel.fromJSON(saved) : new IntentModel();
      const res = inferAll(d, { model: model.current });
      corpus.current = res.corpus;
      setData(d);
      setDecisions(res.decisions);
      setDone(new Set());
      setSkipped([]);
      setLedger([]);
      setStaged(selectForAutopilot(res.decisions, new Set()).map((x) => x.issue.number));
      setStartedAt(Date.now());
      if (note) toast({ tone: 'error', text: note });
    },
    [toast],
  );

  useEffect(() => {
    let alive = true;
    loadInitial(setStatus).then(({ data: d, note }) => alive && boot(d, note));
    return () => {
      alive = false;
    };
  }, [boot]);

  const loadRepo = useCallback(
    async (repo: string) => {
      setBusy(true);
      try {
        const d = await fetchDataset(repo, { token: token || undefined, onProgress: setStatus });
        boot(d);
        const url = new URL(window.location.href);
        url.searchParams.set('repo', repo);
        url.searchParams.delete('sample');
        window.history.replaceState(null, '', url);
      } catch (e) {
        const msg = e instanceof GitHubError && e.rateLimited ? `${e.message} Add a token (read-only is fine) or try again later.` : (e as Error).message;
        toast({ tone: 'error', text: msg });
      } finally {
        setBusy(false);
      }
    },
    [boot, toast, token],
  );

  const persist = () => data && store.set(modelKey(data.repo), model.current.toJSON());

  /** Learn from a human signal, re-score everything, and say what changed. */
  const learn = useCallback(
    (d: Decision, target: IntentId | { not: IntentId }, silent = false) => {
      if (!corpus.current) return;
      const intent = typeof target === 'string' ? target : target.not;
      const before = model.current.predict(d.features)[intent];
      model.current.learn(d.features, target);
      const after = model.current.predict(d.features)[intent];
      persist();
      const res = rescore(decisions, corpus.current, model.current, new Date());
      setDecisions(res.decisions);
      const others = res.changed.filter((n) => n !== d.issue.number && !done.has(n));
      if (silent) return;
      const name = INTENT_META[intent].name.toLowerCase();
      const what =
        typeof target === 'string'
          ? `Issues like #${d.issue.number} now read as ${name}: ${Math.round(before * 100)}% → ${Math.round(after * 100)}%.`
          : `Less likely to call issues like #${d.issue.number} ${name}: ${Math.round(before * 100)}% → ${Math.round(after * 100)}%.`;
      toast({ tone: 'learn', text: `Learned. ${what}${others.length ? ` ${others.length} other card${others.length > 1 ? 's' : ''} in your queue changed.` : ''}` });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisions, done, data],
  );

  const approve = useCallback(
    async (d: Decision, action: ProposedAction, actor: Actor = 'human') => {
      if (!data) return;
      const entry = makeEntry(d, action, actor, token ? 'github' : 'local');
      weightsBefore.current.set(entry.id, structuredClone(model.current.weights));
      setDone((s) => new Set(s).add(d.issue.number));
      setPinned(null);
      setStaged((s) => s.filter((n) => n !== d.issue.number));
      setLedger((l) => [...l, entry]);
      if (entry.corrected) learn(d, action.intent);
      else learn(d, action.intent, true); // reinforce quietly
      if (token) {
        try {
          applied.current.set(entry.id, await applyToGitHub(data.repo, d.issue.number, action, token));
          toast({ tone: 'ok', text: `#${d.issue.number}: ${action.verb} — applied on GitHub.`, undoId: entry.id });
        } catch (e) {
          setLedger((l) => l.map((x) => (x.id === entry.id ? { ...x, undone: true } : x)));
          setDone((s) => {
            const n = new Set(s);
            n.delete(d.issue.number);
            return n;
          });
          toast({ tone: 'error', text: `GitHub rejected #${d.issue.number}: ${(e as Error).message}. Nothing was changed; the card is back in your queue.` });
        }
      } else {
        toast({ tone: 'ok', text: `#${d.issue.number}: ${action.verb}.`, undoId: entry.id });
      }
    },
    [data, learn, toast, token],
  );

  const undo = useCallback(
    async (entryId: string) => {
      const e = ledger.find((x) => x.id === entryId);
      if (!e || e.undone || !data) return;
      const ref = applied.current.get(entryId);
      if (ref && token) {
        try {
          await undoOnGitHub(data.repo, e.issue, ref, token);
        } catch (err) {
          toast({ tone: 'error', text: `Could not fully undo on GitHub: ${(err as Error).message}` });
        }
      }
      // If this was the most recent action, also roll back what the model learned from it.
      const last = [...ledger].reverse().find((x) => !x.undone);
      const before = weightsBefore.current.get(entryId);
      if (last?.id === entryId && before && corpus.current) {
        model.current.weights = before;
        persist();
        setDecisions(rescore(decisions, corpus.current, model.current, new Date()).decisions);
      }
      setLedger((l) => l.map((x) => (x.id === entryId ? { ...x, undone: true } : x)));
      setDone((s) => {
        const n = new Set(s);
        n.delete(e.issue);
        return n;
      });
      setSkipped((s) => s.filter((n) => n !== e.issue));
      toast({ tone: 'info', text: `Undone: #${e.issue} is back at the front of your queue.` });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger, data, token, decisions, toast],
  );

  const skip = useCallback((d: Decision) => {
    setPinned(null);
    setSkipped((s) => [...s.filter((n) => n !== d.issue.number), d.issue.number]);
  }, []);

  /** Human rejected a card the interface prepared on its own: it becomes a normal card and the model learns. */
  const rejectStaged = useCallback(
    (d: Decision) => {
      setStaged((s) => s.filter((n) => n !== d.issue.number));
      setRejected((r) => ({ ...r, [d.issue.number]: d.hypotheses[0].intent }));
      setPinned(d.issue.number); // the human just engaged with it: show it now, as a question
      learn(d, { not: d.hypotheses[0].intent });
    },
    [learn],
  );

  const approveAllStaged = useCallback(async () => {
    for (const d of stagedDecisions) await approve(d, d.hypotheses[0].action, 'autopilot');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve, decisions, staged, done]);

  const resetLearning = useCallback(() => {
    if (!data || !corpus.current) return;
    store.del(modelKey(data.repo));
    model.current = new IntentModel();
    setDecisions(rescore(decisions, corpus.current, model.current, new Date()).decisions);
    toast({ tone: 'info', text: 'Model reset to its starting priors for this repo.' });
  }, [data, decisions, toast]);

  // Staged items are re-checked against the autopilot policy after every re-score: if learning made
  // the system less sure about one, it silently moves back to the human queue.
  const stagedDecisions = useMemo(() => selectForAutopilot(decisions.filter((d) => staged.includes(d.issue.number)), done), [decisions, staged, done]);
  const stagedSet = useMemo(() => new Set(stagedDecisions.map((d) => d.issue.number)), [stagedDecisions]);
  const focus = useMemo(() => inferFocus(ledger), [ledger]);
  const queue = useMemo(() => orderQueue(decisions, done, skipped, stagedSet, focus), [decisions, done, skipped, stagedSet, focus]);

  return {
    data,
    status,
    busy,
    decisions,
    queue,
    current: (queue.find((d) => d.issue.number === pinned) ?? queue[0]) as Decision | undefined,
    rejected,
    stagedDecisions,
    ledger,
    toasts,
    focus,
    token,
    startedAt,
    minutesLeft: estimateMinutes(queue) + (stagedDecisions.length ? 1 : 0),
    modelUpdates: model.current.updates,
    setToken,
    loadRepo,
    approve,
    skip,
    undo,
    learn,
    rejectStaged,
    approveAllStaged,
    resetLearning,
    dismissToast,
  };
}

export type Triage = ReturnType<typeof useTriage>;
