// SYNTHETIC offline fallback + test fixture. The live demo reads real issues from the GitHub API
// (or the CI-built snapshot of a real repo); this is only used when both are unavailable, and the UI
// badges it as "sample data". Issues are written to mirror common patterns in real bundler trackers.

import type { Dataset, Issue } from '../engine/types';

type Seed = Omit<Issue, 'createdAt' | 'updatedAt' | 'url' | 'state' | 'comments' | 'reactions' | 'authorAssociation' | 'labels'> &
  Partial<Pick<Issue, 'comments' | 'reactions' | 'authorAssociation' | 'labels' | 'state' | 'stateReason'>> & { age: number; idle?: number };

const REPO = 'sample/web-bundler';
const ENV = '```\nSystem:\n  OS: macOS 15.1\n  Node: 22.11.0\nnpmPackages:\n  web-bundler: 7.2.1\n```';

const open: Seed[] = [
  {
    number: 1412,
    title: 'Dev server exposes files outside root when path contains encoded ../ on Windows',
    author: 'sec-researcher',
    body: `Requesting \`/@fs/..%2f..%2fsecret.env\` returns the contents of files outside the project root when the dev server is started with --host. This bypasses fs.deny and could leak secrets on shared networks.\n\n### Reproduction\nhttps://github.com/sec-researcher/fs-deny-bypass\n\n${ENV}`,
    age: 1,
    reactions: 3,
  },
  {
    number: 1409,
    title: 'HMR stops working after upgrading to 7.2.0 — worked in 7.1.4',
    author: 'mara-dev',
    body: `After upgrading from 7.1.4 to 7.2.0, editing a Vue SFC no longer triggers a hot update; the page does a full reload every time.\n\n### Steps to reproduce\n1. npm create app@latest\n2. edit src/App.vue\n3. observe full reload\n\nReproduction: https://stackblitz.com/edit/hmr-full-reload-7-2\n\n${ENV}`,
    age: 2,
    reactions: 14,
    comments: 6,
  },
  {
    number: 1411,
    title: 'HMR full reload on every Vue SFC edit since 7.2',
    author: 'kenji-o',
    body: 'Same here, every edit to a .vue file triggers a full page reload instead of hot update since 7.2. Very annoying.',
    age: 1,
    labels: ['pending triage'],
  },
  {
    number: 1403,
    title: 'CSS modules: class names not hashed in production build when using :global',
    author: 'lin-wei',
    body: `When a CSS module file contains a \`:global\` block, local class names in the same file are emitted without hashing in \`build\`, causing collisions.\n\n### Steps to reproduce\n1. clone repo\n2. npm run build\n3. inspect dist/assets/index.css\n\nhttps://github.com/lin-wei/css-modules-global-hash\n\n\`\`\`css\n.button { color: red }\n:global(.theme) .button { color: blue }\n\`\`\`\n\n${ENV}`,
    age: 5,
    labels: ['pending triage'],
    reactions: 4,
  },
  {
    number: 1401,
    title: 'Build fails',
    author: 'newuser42',
    body: '### Describe the bug\n\nA clear and concise description of what the bug is.\n\nbuild fails with error\n\n### Reproduction\n\n### System Info\n\n- [ ] Follow our Code of Conduct',
    age: 3,
    labels: ['pending triage'],
  },
  {
    number: 1399,
    title: 'TypeError: Cannot read properties of undefined (reading "url") in import analysis',
    author: 'p-garcia',
    body: 'Getting this when I start the dev server in my monorepo:\n\n```\nTypeError: Cannot read properties of undefined (reading \'url\')\n    at importAnalysisPlugin.transform (dep-B1x.js:6630:31)\n    at async PluginContainer.transform\n```\n\nNo idea what causes it, the project is private so I can\'t share it.',
    age: 4,
    labels: ['pending triage'],
    reactions: 2,
  },
  {
    number: 1396,
    title: 'How do I use environment variables in my config file?',
    author: 'sam-fe',
    body: 'I want to read an env variable inside the config to switch the base path. process.env is empty for my .env values. What is the right way to do this?',
    age: 6,
    labels: ['pending triage'],
  },
  {
    number: 1393,
    title: 'Feature request: option to disable the dev server overlay per error type',
    author: 'olga-k',
    body: 'It would be great to have an option to disable the error overlay only for warnings coming from the TypeScript checker plugin, while keeping it for runtime errors. Right now it is all or nothing. Proposal: `server.hmr.overlay: { ignore: [...] }`.',
    age: 9,
    reactions: 7,
    comments: 2,
  },
  {
    number: 1390,
    title: 'Docs: typo and broken link in the SSR guide',
    author: 'doc-fixer',
    body: 'In the SSR guide the section "Setting up the dev server" links to a 404 page and "middlware" is misspelled.',
    age: 12,
  },
  {
    number: 1377,
    title: 'Dev server randomly crashes with ECONNRESET on CI',
    author: 'hugo-b',
    body: 'Sometimes the dev server dies on our CI runners with ECONNRESET. Cannot reproduce it locally and it happens maybe once a week.',
    age: 140,
    idle: 120,
    labels: ['needs reproduction'],
  },
  {
    number: 1371,
    title: 'Is it possible to have multiple entry points with different base paths?',
    author: 'dmitri',
    body: 'We have an admin app and a public app in the same repo. Can I build both with different `base` values in one config?',
    age: 20,
  },
  {
    number: 1366,
    title: 'Worker imports with ?worker&inline break source maps in build',
    author: 'aya-t',
    body: `Source maps for inline workers point to the wrong file after build.\n\n### Steps to reproduce\n1. open reproduction\n2. npm run build && npm run preview\n3. set a breakpoint in worker.ts\n\nhttps://stackblitz.com/edit/inline-worker-sourcemap\n\n${ENV}`,
    age: 24,
    labels: ['pending triage'],
    authorAssociation: 'CONTRIBUTOR',
  },
  {
    number: 1360,
    title: 'Add support for import attributes (with { type: "json" }) in dependency pre-bundling',
    author: 'core-dev',
    body: 'Dependency pre-bundling should preserve import attributes. Would be nice to align with the spec now that Node supports it. Enhancement tracking issue.',
    age: 30,
    authorAssociation: 'MEMBER',
    reactions: 11,
  },
  {
    number: 1352,
    title: 'Build is slow',
    author: 'anon-dev',
    body: 'My build takes 3 minutes. Why?',
    age: 60,
    idle: 58,
  },
];

const closed: Seed[] = [
  {
    number: 1301,
    title: 'Dev server proxy does not forward websocket upgrade (ws: true)',
    author: 'r-ito',
    body: 'server.proxy with ws: true never forwards websocket upgrade requests to the backend; fixed by upgrading http-proxy.',
    age: 200,
    state: 'closed',
    stateReason: 'completed',
  },
  {
    number: 1288,
    title: 'Environment variables from .env not available in config file',
    author: 'j-doe',
    body: 'process.env does not contain .env values inside the config. Answer: use loadEnv(mode, process.cwd()) in the config.',
    age: 180,
    state: 'closed',
    stateReason: 'completed',
  },
];

function toIssue(s: Seed, now: Date): Issue {
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  return {
    number: s.number,
    title: s.title,
    body: s.body,
    author: s.author,
    labels: s.labels ?? [],
    comments: s.comments ?? 0,
    reactions: s.reactions ?? 0,
    authorAssociation: s.authorAssociation ?? 'NONE',
    createdAt: d(s.age),
    updatedAt: d(s.idle ?? Math.min(s.age, 1)),
    state: s.state ?? 'open',
    stateReason: s.stateReason ?? null,
    url: `https://github.com/${REPO}/issues/${s.number}`,
  };
}

export function sampleDataset(now = new Date()): Dataset {
  return {
    repo: REPO,
    fetchedAt: now.toISOString(),
    source: 'sample',
    labels: ['pending triage', 'bug', 'regression', 'duplicate', 'needs reproduction', 'question', 'enhancement', 'documentation', 'security', 'feat: css', 'feat: hmr', 'feat: ssr', 'feat: build', 'feat: dev server', 'feat: web workers', 'feat: deps optimizer', 'p2-edge-case', 'p3-minor-bug', 'p4-important', 'good first issue'],
    open: open.map((s) => toIssue(s, now)),
    closed: closed.map((s) => toIssue(s, now)),
  };
}

/** Expected top intent per sample issue — used by tests to measure the model, not by the app. */
export const SAMPLE_EXPECTED: Record<number, string> = {
  1412: 'security',
  1409: 'regression',
  1411: 'duplicate',
  1403: 'bug-ready',
  1401: 'needs-repro',
  1399: 'needs-repro',
  1396: 'duplicate', // already answered in closed #1288
  1393: 'feature',
  1390: 'docs',
  1377: 'stale',
  1371: 'question',
  1366: 'bug-ready',
  1360: 'feature',
  1352: 'needs-repro',
};
