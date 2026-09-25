// Headless runner: the same engine the UI uses, printed as a triage plan.
//   npm run triage -- vitejs/vite          (live, uses GITHUB_TOKEN if set)
//   npm run triage -- --sample             (offline sample data)
//   npm run triage -- vitejs/vite --json   (machine-readable)
import { sampleDataset } from '../data/sample';
import { fetchDataset, inferAll, orderQueue, selectForAutopilot, type Dataset } from '../engine';

const args = process.argv.slice(2);
const json = args.includes('--json');
const repo = args.find((a) => !a.startsWith('--'));

const data: Dataset = args.includes('--sample') || !repo ? sampleDataset() : await fetchDataset(repo, { token: process.env.GITHUB_TOKEN });
const { decisions } = inferAll(data);
const staged = new Set(selectForAutopilot(decisions, new Set()).map((d) => d.issue.number));
const queue = orderQueue(decisions, new Set(), [], new Set());

if (json) {
  console.log(JSON.stringify(queue.map((d) => ({ issue: d.issue.number, title: d.issue.title, intent: d.hypotheses[0].intent, confidence: +d.confidence.toFixed(3), abstain: d.abstain, staged: staged.has(d.issue.number), action: d.hypotheses[0].action })), null, 2));
} else {
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log(`\n${data.repo} — ${data.open.length} open issues (${data.source})\n`);
  for (const d of queue) {
    const h = d.hypotheses[0];
    const tag = d.abstain ? 'ASK ' : staged.has(d.issue.number) ? 'AUTO' : '    ';
    console.log(`${tag} #${String(d.issue.number).padEnd(6)} ${pad(h.intent, 11)} ${(d.confidence * 100).toFixed(0).padStart(3)}%  ${pad(h.action.verb, 48)} ${pad(d.issue.title, 60)}`);
  }
  const ask = queue.filter((d) => d.abstain).length;
  console.log(`\n${staged.size} actions would be prepared automatically (AUTO), ${ask} need a human reading (ASK), ${queue.length - staged.size - ask} are one-keystroke decisions.\n`);
}
