// Feature extraction: turns a raw issue into named signals in [0,1], each with a quotable note.
// These are the only inputs the model sees, which is what makes every guess explainable.

import type { FeatureId, FeatureVector, Issue, SimilarMatch } from './types';

export const FEATURE_LABELS: Record<FeatureId, string> = {
  bias: 'Base rate',
  reproLink: 'Has a reproduction link',
  stepsToReproduce: 'Lists steps to reproduce',
  codeBlock: 'Includes code or config',
  stackTrace: 'Includes an error / stack trace',
  versionInfo: 'Includes version / environment info',
  questionForm: 'Reads like a usage question',
  featureForm: 'Reads like a feature request',
  regressionForm: 'Says it worked in an earlier version',
  securityForm: 'Mentions a security impact',
  docsForm: 'About documentation',
  shortBody: 'Very short description',
  templateUnfilled: 'Issue template left mostly empty',
  staleness: 'No activity for a long time',
  waitingOnAuthor: 'Waiting on the author',
  similarity: 'Very similar to another issue',
  traction: 'Other users are affected (reactions/comments)',
  maintainerAuthor: 'Opened by a maintainer',
  alreadyTriaged: 'Already has triage labels',
};

const RX = {
  reproLink: /(stackblitz\.com|codesandbox\.io|github\.com\/[\w.-]+\/[\w.-]+(?!\/(issues|pull))|repl\.it|replit\.com|playground|minimal[- ]repro(duction)?\s*(:|link|repo))/i,
  steps: /(steps to reproduce|to reproduce|repro steps|^\s*1\.\s+\S+[\s\S]*^\s*2\.\s+\S+)/im,
  code: /```|^ {4}\S/m,
  stack: /(\b(TypeError|ReferenceError|SyntaxError|RangeError|Error|Exception|panic)\b:|^\s+at\s+\S+\s+\(|ERR_[A-Z_]+|Traceback \(most recent)/m,
  version: /(system:\s|binaries:|npmpackages:|envinfo|\bv?\d+\.\d+\.\d+\b|node\s*v?\d+|"[\w@/-]+"\s*:\s*"\^?\d)/i,
  question: /^(how|is it possible|can i|can we|could|why|what|where|should i|does|do i|is there)\b|\bhow (do|can|to|should)\b|\?\s*$|\b(help needed|any idea|anyone know|best way to)\b/i,
  feature: /\b(feature request|proposal|rfc|add support|support for|would be (nice|great|useful)|allow (users|to|configuring)|option to|ability to|enhancement|it would help|suggest(ion)?|please add)\b/i,
  regression: /\b(regression|regressed|worked (fine |perfectly |correctly )?(in|on|with|before)|used to work|broke(n)? (in|after|since)|after (upgrading|updating|bumping)|since (v|version )?\d|starting from v?\d|no longer works|stopped working)\b/i,
  security: /\b(security|vulnerab\w*|cve-\d|xss|csrf|path traversal|arbitrary (file|code)|remote code|rce|exposes?|leak(s|ed|ing)? (secret|env|token|credentials)|bypass(es)? (fs\.)?(deny|allow)|sandbox escape|prototype pollution)\b/i,
  docs: /\b(docs?|documentation|typo|readme|guide|example in the docs|misleading (doc|comment))\b/i,
  template: /(a clear and concise description|what did you expect|<!--|\[ \]\s)/i,
};

const WAITING = /(need(s)? (reproduction|repro|more info|info)|awaiting|waiting|author feedback|needs-repro|incomplete|cannot reproduce|stale)/i;
const TRIAGE_DONE = /^(bug|enhancement|feat(ure)?\b|p[0-9]|documentation|docs|question|duplicate|regression|confirmed|has workaround|good first issue|help wanted)/i;

function snippet(text: string, rx: RegExp, max = 64): string | undefined {
  const m = rx.exec(text);
  if (!m) return undefined;
  // Quote from the match to the end of its line: short, and it points at the exact words that fired.
  const line = text.slice(m.index).split('\n')[0].replace(/[`#*>]/g, '').replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}

export function daysBetween(a: string, b: Date): number {
  return (b.getTime() - new Date(a).getTime()) / 86_400_000;
}

export interface ExtractContext {
  now: Date;
  similar: SimilarMatch[];
}

export function extractFeatures(issue: Issue, ctx: ExtractContext): { vector: FeatureVector; notes: Partial<Record<FeatureId, string>> } {
  const title = issue.title;
  const body = issue.body ?? '';
  const all = `${title}\n${body}`;
  const notes: Partial<Record<FeatureId, string>> = {};
  const has = (id: FeatureId, rx: RegExp, text = all): number => {
    const s = snippet(text, rx);
    if (s) notes[id] = s;
    return s ? 1 : 0;
  };

  const bodyLen = body.replace(/<!--[\s\S]*?-->/g, '').trim().length;
  const templateHits = (body.match(new RegExp(RX.template.source, 'gi')) ?? []).length;
  const idle = daysBetween(issue.updatedAt, ctx.now);
  const top = ctx.similar[0];
  const labels = issue.labels;
  const waitingLabel = labels.find((l) => WAITING.test(l));
  const triageLabels = labels.filter((l) => TRIAGE_DONE.test(l));

  const vector: FeatureVector = {
    bias: 1,
    reproLink: has('reproLink', RX.reproLink, body),
    stepsToReproduce: has('stepsToReproduce', RX.steps, body),
    codeBlock: RX.code.test(body) ? 1 : 0,
    stackTrace: has('stackTrace', RX.stack, body),
    versionInfo: has('versionInfo', RX.version, body),
    questionForm: Math.max(has('questionForm', RX.question, title), RX.question.test(body.slice(0, 300)) ? 0.5 : 0),
    featureForm: has('featureForm', RX.feature),
    regressionForm: has('regressionForm', RX.regression),
    securityForm: has('securityForm', RX.security),
    docsForm: RX.docs.test(title) ? has('docsForm', RX.docs, title) : 0,
    shortBody: bodyLen < 120 ? 1 : bodyLen < 300 ? 0.5 : 0,
    templateUnfilled: templateHits >= 2 && bodyLen < 900 ? 1 : 0,
    staleness: Math.min(1, Math.max(0, (idle - 30) / 150)),
    waitingOnAuthor: waitingLabel ? 1 : 0,
    similarity: top ? Math.min(1, Math.max(0, (top.score - 0.22) / 0.38)) : 0,
    traction: Math.min(1, Math.log1p(issue.reactions + issue.comments) / Math.log1p(25)),
    maintainerAuthor: /^(OWNER|MEMBER|COLLABORATOR)$/.test(issue.authorAssociation) ? 1 : 0,
    alreadyTriaged: triageLabels.length > 0 ? 1 : 0,
  };

  if (bodyLen < 300) notes.shortBody = `${bodyLen} characters of description`;
  if (vector.staleness > 0) notes.staleness = `last activity ${Math.round(idle)} days ago`;
  if (waitingLabel) notes.waitingOnAuthor = `labelled “${waitingLabel}”`;
  if (top && vector.similarity > 0) notes.similarity = `#${top.number} “${top.title}” (${Math.round(top.score * 100)}% match on ${top.sharedTerms.join(', ')})`;
  if (vector.traction > 0.3) notes.traction = `${issue.reactions} reactions, ${issue.comments} comments`;
  if (vector.maintainerAuthor) notes.maintainerAuthor = `@${issue.author} is a ${issue.authorAssociation.toLowerCase()}`;
  if (triageLabels.length) notes.alreadyTriaged = triageLabels.join(', ');
  if (vector.templateUnfilled) notes.templateUnfilled = 'template placeholders are still in the body';
  if (vector.codeBlock) notes.codeBlock = 'code block present';

  return { vector, notes };
}
