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

export function contextEmoji(ctx: { emoji?: string | null; color: string | null }): string | null {
  return ctx.emoji || nearestEmoji(ctx.color);
}

export const EMOJI_MAX_LENGTH = 32;

export function graphemes(s: string): string[] {
  const Segmenter = (
    Intl as { Segmenter?: new () => { segment(s: string): Iterable<{ segment: string }> } }
  ).Segmenter;
  if (Segmenter) return Array.from(new Segmenter().segment(s), (x) => x.segment);
  return Array.from(s);
}

export function firstGrapheme(s: string): string {
  return graphemes(s.trim())[0] ?? '';
}

export function isSingleGrapheme(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= EMOJI_MAX_LENGTH && graphemes(t).length === 1;
}
