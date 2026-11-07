/** mulberry32 with externally stored state so GameState stays serializable. */
export function nextFloat(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function nextInt(holder: { rng: number }, n: number): number {
  return Math.floor(nextFloat(holder) * n);
}
export function shuffle<T>(holder: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
export function rollDie(holder: { rng: number }): number {
  return 1 + nextInt(holder, 6);
}
