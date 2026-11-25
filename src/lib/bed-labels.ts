/** "Bed 1 to 30" -> ["Bed 1", ..., "Bed 30"]. An empty prefix gives bare numbers. */
export function buildBedLabels(prefix: string, from: number, to: number): string[] {
  const p = prefix.trim();
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(p ? `${p} ${n}` : String(n));
  return out;
}
