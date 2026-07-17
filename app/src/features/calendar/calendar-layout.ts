// Side-by-side layout for overlapping calendar blocks (Google-Calendar style).
// Packs blocks into lanes: within a cluster of chain-overlapping blocks, each
// block gets a lane index (`col`) and the cluster's total lane count (`cols`),
// so the renderer can split the column width evenly among concurrent blocks.

export interface BlockLayout {
  col: number; // 0-based lane within the cluster
  cols: number; // total lanes in the cluster (1 = no overlap)
}

export function layoutDayBlocks(
  blocks: { id: string; startAt: string; endAt: string }[],
): Map<string, BlockLayout> {
  const out = new Map<string, BlockLayout>();
  // Earliest start first; on a tie the longer block takes the left lane.
  const items = blocks
    .map((b) => ({ id: b.id, start: new Date(b.startAt).getTime(), end: new Date(b.endAt).getTime() }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: string[] = [];
  let laneEnds: number[] = []; // lane index -> last block's end time
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = laneEnds.length;
    for (const id of cluster) out.get(id)!.cols = cols;
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const it of items) {
    // A gap (start at/after every open block's end) closes the current cluster.
    if (cluster.length && it.start >= clusterEnd) flush();
    // Reuse the first lane that has freed up, else open a new lane.
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    out.set(it.id, { col: lane, cols: 1 }); // cols finalized on flush
    cluster.push(it.id);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}
