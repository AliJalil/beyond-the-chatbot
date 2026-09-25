// GitHub REST access. Reads work unauthenticated (60 requests/hour, CORS-enabled).
// Writes are opt-in: only when the user pastes a token, which is kept in memory only.

import type { Dataset, Issue, ProposedAction } from './types';

const API = 'https://api.github.com';

interface RawIssue {
  number: number;
  title: string;
  body: string | null;
  labels: ({ name: string } | string)[];
  comments: number;
  user: { login: string } | null;
  author_association: string;
  created_at: string;
  updated_at: string;
  reactions?: { total_count: number };
  state: 'open' | 'closed';
  state_reason?: string | null;
  html_url: string;
  pull_request?: unknown;
}

export function normalizeIssue(r: RawIssue): Issue {
  return {
    number: r.number,
    title: r.title,
    body: (r.body ?? '').slice(0, 6000),
    labels: r.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    comments: r.comments,
    author: r.user?.login ?? 'ghost',
    authorAssociation: r.author_association,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reactions: r.reactions?.total_count ?? 0,
    state: r.state,
    stateReason: r.state_reason ?? null,
    url: r.html_url,
  };
}

export class GitHubError extends Error {
  constructor(message: string, readonly status: number, readonly rateLimited = false) {
    super(message);
  }
}

async function gh<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
    const msg = rateLimited ? 'GitHub rate limit reached (60 requests/hour without a token).' : `GitHub API ${res.status} on ${path}`;
    throw new GitHubError(msg, res.status, rateLimited);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function parseRepo(input: string): string | null {
  const m = input.trim().match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git|\/.*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Fetch open issues (up to `pages`×100, PRs excluded), recently closed issues and the label set. */
export async function fetchDataset(repo: string, opts: { token?: string; pages?: number; onProgress?: (msg: string) => void } = {}): Promise<Dataset> {
  const { token, pages = 2, onProgress } = opts;
  const open: Issue[] = [];
  for (let p = 1; p <= pages; p++) {
    onProgress?.(`Reading open issues (page ${p})…`);
    const batch = await gh<RawIssue[]>(`/repos/${repo}/issues?state=open&per_page=100&page=${p}&sort=created&direction=desc`, token);
    open.push(...batch.filter((i) => !i.pull_request).map(normalizeIssue));
    if (batch.length < 100) break;
  }
  onProgress?.('Reading recently closed issues…');
  const closedRaw = await gh<RawIssue[]>(`/repos/${repo}/issues?state=closed&per_page=100&sort=updated&direction=desc`, token);
  onProgress?.('Reading labels…');
  const labels = await gh<{ name: string }[]>(`/repos/${repo}/labels?per_page=100`, token);
  return {
    repo,
    fetchedAt: new Date().toISOString(),
    source: 'live',
    labels: labels.map((l) => l.name),
    open,
    closed: closedRaw.filter((i) => !i.pull_request).map(normalizeIssue),
  };
}

export interface AppliedRef {
  commentId?: number;
  closed: boolean;
  added: string[];
  removed: string[];
}

/** Apply a reviewed action to GitHub. Returns what was done so it can be undone. */
export async function applyToGitHub(repo: string, issue: number, a: ProposedAction, token: string): Promise<AppliedRef> {
  const ref: AppliedRef = { closed: false, added: [], removed: [] };
  if (a.addLabels.length) {
    await gh(`/repos/${repo}/issues/${issue}/labels`, token, { method: 'POST', body: JSON.stringify({ labels: a.addLabels }) });
    ref.added = a.addLabels;
  }
  for (const l of a.removeLabels) {
    await gh(`/repos/${repo}/issues/${issue}/labels/${encodeURIComponent(l)}`, token, { method: 'DELETE' }).catch(() => undefined);
    ref.removed.push(l);
  }
  if (a.comment) {
    const c = await gh<{ id: number }>(`/repos/${repo}/issues/${issue}/comments`, token, { method: 'POST', body: JSON.stringify({ body: a.comment }) });
    ref.commentId = c.id;
  }
  if (a.close) {
    await gh(`/repos/${repo}/issues/${issue}`, token, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: a.close }) });
    ref.closed = true;
  }
  return ref;
}

/** Reverse an applied action: reopen, restore labels, and remove the comment we posted. */
export async function undoOnGitHub(repo: string, issue: number, ref: AppliedRef, token: string): Promise<void> {
  if (ref.closed) await gh(`/repos/${repo}/issues/${issue}`, token, { method: 'PATCH', body: JSON.stringify({ state: 'open' }) });
  for (const l of ref.added) await gh(`/repos/${repo}/issues/${issue}/labels/${encodeURIComponent(l)}`, token, { method: 'DELETE' }).catch(() => undefined);
  if (ref.removed.length) await gh(`/repos/${repo}/issues/${issue}/labels`, token, { method: 'POST', body: JSON.stringify({ labels: ref.removed }) });
  if (ref.commentId) await gh(`/repos/${repo}/issues/comments/${ref.commentId}`, token, { method: 'DELETE' });
}
