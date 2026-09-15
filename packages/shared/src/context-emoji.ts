// Fixed palette with a representative RGB per emoji for nearest matching.
// Tuned so the app's context colors map intuitively (amber → 🟠, not 🟡).
const PALETTE: { emoji: string; rgb: [number, number, number] }[] = [
  { emoji: '🔵', rgb: [45, 120, 230] },
  { emoji: '🟢', rgb: [80, 190, 90] },
  { emoji: '🟠', rgb: [240, 148, 32] },
  { emoji: '🔴', rgb: [225, 70, 60] },
  { emoji: '🟣', rgb: [150, 90, 215] },
  { emoji: '🟡', rgb: [247, 203, 45] },
  { emoji: '⚪', rgb: [235, 235, 235] },
  { emoji: '⚫', rgb: [40, 40, 40] },
  { emoji: '🟤', rgb: [140, 90, 55] },
];

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Nearest palette emoji to a hex color by squared RGB distance.
export function nearestEmoji(hex: string | null): string | null {
  if (!hex) return null;
  const rgb = parseHex(hex);
  if (!rgb) return null;
  let best = PALETTE[0].emoji;
  let bestD = Infinity;
  for (const p of PALETTE) {
    const d = (p.rgb[0] - rgb[0]) ** 2 + (p.rgb[1] - rgb[1]) ** 2 + (p.rgb[2] - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.emoji;
    }
  }
  return best;
}

// The emoji to show for a context: its own when set, else derived from its color.
export function contextEmoji(ctx: { emoji?: string | null; color: string | null }): string | null {
  return ctx.emoji || nearestEmoji(ctx.color);
}
