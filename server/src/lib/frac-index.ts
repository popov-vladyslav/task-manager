// Fractional indexing on a `real` sort column. List order is ascending
// (smaller value = higher in the list). Returns a value strictly between the
// two neighbors; a periodic rebalance (out of Phase-1 scope) resets precision.
export function between(after: number | null, before: number | null): number {
  if (after == null && before == null) return 0;
  if (after == null) return (before as number) - 1;
  if (before == null) return after + 1;
  return (after + before) / 2;
}
