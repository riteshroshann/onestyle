// BIO-constrained Viterbi. Mirror of engine/bespoke/decode.py.
export function viterbi(logp: number[][], labels: string[]): string[] {
  const n = logp.length, k = labels.length;
  if (!n) return [];
  const NEG = -1e9;
  const ok = (a: string, b: string) => !b.startsWith("I-") || a === `B-${b.slice(2)}` || a === b;
  let score = labels.map((l, j) => (l.startsWith("I-") ? NEG : 0) + logp[0][j]);
  const back: number[][] = [];
  for (let i = 1; i < n; i++) {
    const next = new Array(k).fill(NEG), arg = new Array(k).fill(0);
    for (let b = 0; b < k; b++) {
      for (let a = 0; a < k; a++) {
        const s = score[a] + (ok(labels[a], labels[b]) ? 0 : NEG);
        if (s > next[b]) { next[b] = s; arg[b] = a; }
      }
      next[b] += logp[i][b];
    }
    back.push(arg);
    score = next;
  }
  let best = score.indexOf(Math.max(...score));
  const path = [best];
  for (let i = back.length - 1; i >= 0; i--) { best = back[i][best]; path.push(best); }
  return path.reverse().map((j) => labels[j]);
}
