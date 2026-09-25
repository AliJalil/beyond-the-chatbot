// Builds public/snapshot.json from a real repository so the deployed demo works even when the
// visitor's browser hits GitHub's unauthenticated rate limit. Run in CI with GITHUB_TOKEN.
//   npm run snapshot -- vitejs/vite
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchDataset } from '../src/engine/github';

const repo = process.argv[2] ?? process.env.SNAPSHOT_REPO ?? 'vitejs/vite';
const token = process.env.GITHUB_TOKEN || undefined;

const data = await fetchDataset(repo, { token, pages: 3, onProgress: (m) => console.log(m) });
mkdirSync('public', { recursive: true });
writeFileSync('public/snapshot.json', JSON.stringify({ ...data, source: 'snapshot' }));
console.log(`Wrote public/snapshot.json — ${data.open.length} open, ${data.closed.length} closed, ${data.labels.length} labels from ${repo}`);
