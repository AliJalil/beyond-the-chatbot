// Small, dependency-free text utilities: tokenizer, TF-IDF index and cosine similarity.
// Used for duplicate detection, area-label inference and gist extraction.

const STOP = new Set(
  (
    'a an the and or but if then else when while of to in on at by for with from into onto over under about as is are was were be been being ' +
    'it its this that these those there here i me my we our you your he she they them their what which who whom how why where can could ' +
    'should would will shall may might must do does did done doing have has had having not no yes so than too very just also only ' +
    'using use used get got gets set sets like any some all each every more most other such same own out up down off again further once ' +
    'issue issues bug bugs problem error errors work works working expected actual behavior behaviour describe description reproduction ' +
    'reproduce steps step version versions system info information please thanks thank hi hello following see seems seem still ' +
    'after before new old one two first second via vs etc e g ie eg im dont doesnt cant isnt wont didnt'
  ).split(/\s+/),
);

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Lowercase word tokens with code identifiers kept (e.g. `import.meta.glob` → import, meta, glob). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9_$@\-]+/)) {
    for (const part of raw.split(/[-_]/)) {
      if (part.length < 3 || part.length > 30) continue;
      if (/^\d+$/.test(part)) continue;
      if (STOP.has(part)) continue;
      out.push(stem(part));
    }
  }
  return out;
}

export type SparseVec = Map<string, number>;

export class TfIdfIndex {
  private df = new Map<string, number>();
  private docs = new Map<number, SparseVec>();
  private n = 0;

  constructor(docs: { id: number; text: string }[]) {
    const tfs: { id: number; tf: Map<string, number> }[] = [];
    for (const d of docs) {
      const tf = new Map<string, number>();
      for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      tfs.push({ id: d.id, tf });
    }
    this.n = docs.length;
    for (const { id, tf } of tfs) this.docs.set(id, this.weigh(tf));
  }

  idf(term: string): number {
    return Math.log((1 + this.n) / (1 + (this.df.get(term) ?? 0))) + 1;
  }

  private weigh(tf: Map<string, number>): SparseVec {
    const v: SparseVec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * this.idf(t);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }

  vectorFor(text: string): SparseVec {
    const tf = new Map<string, number>();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return this.weigh(tf);
  }

  vector(id: number): SparseVec | undefined {
    return this.docs.get(id);
  }

  /** Most similar documents to `id`, excluding itself. */
  nearest(id: number, k = 3): { id: number; score: number; shared: string[] }[] {
    const v = this.docs.get(id);
    if (!v) return [];
    const res: { id: number; score: number; shared: string[] }[] = [];
    for (const [otherId, o] of this.docs) {
      if (otherId === id) continue;
      const { score, shared } = cosine(v, o);
      if (score > 0) res.push({ id: otherId, score, shared });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export function cosine(a: SparseVec, b: SparseVec): { score: number; shared: string[] } {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  const contrib: [string, number][] = [];
  for (const [t, w] of small) {
    const o = big.get(t);
    if (o) {
      s += w * o;
      contrib.push([t, w * o]);
    }
  }
  contrib.sort((x, y) => y[1] - x[1]);
  return { score: s, shared: contrib.slice(0, 4).map(([t]) => t) };
}

/** Remove template noise, HTML comments and fenced code so prose can be summarised. */
export function prose(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/^\s*[-*]\s*\[[ x]\].*$/gim, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First meaningful sentence of the body, or the title if the body is empty. */
export function gistOf(title: string, body: string): string {
  const text = prose(body);
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25 && !/^(describe the bug|a clear and concise|system info|used package manager|logs?|validations|reproduction)/i.test(s));
  const first = sentences[0] ?? '';
  if (!first) return title;
  return first.length > 180 ? first.slice(0, 177).trimEnd() + '…' : first;
}
