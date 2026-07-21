// CR02 §3a — compose a push notification's title. Pure + unit-tested; kept out
// of the send path so the 4×2 matrix (context × due × kind) is testable in
// isolation. The body is always the plain task title (composed by the caller).
//
// Matrix (kind = 'reminder'):
//   ctx yes / due yes → "{emoji} {context} · {rel}"
//   ctx yes / due no  → "{emoji} {context}"
//   ctx no  / due yes → "{rel}"
//   ctx no  / due no  → "Task"
// kind = 'spawn' replaces the relative-time slot with the literal "new"
// (whether or not a due date is set).

export interface NotifTitleInput {
  contextName: string | null;
  contextColor: string | null; // hex, e.g. '#5B8DEF'
  dueAt: Date | string | null;
}

// Fixed palette (CR02) with a representative RGB per emoji for nearest matching.
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

// Relative-time label for a due date (CR02). 'now' wins within ±5 min (incl. up
// to 5 min past); anything more than 5 min in the past is 'overdue'.
export function relativeTime(due: Date, now: Date): string {
  const diffMin = (due.getTime() - now.getTime()) / 60_000;
  if (diffMin < -5) return 'overdue';
  if (diffMin <= 5) return 'now';
  if (diffMin < 60) return `in ${Math.round(diffMin)} min`;
  if (diffMin < 1440) return `in ${Math.round(diffMin / 60)} h`;
  return `in ${Math.round(diffMin / 1440)} d`;
}

export function composeNotificationTitle(
  t: NotifTitleInput,
  kind: 'reminder' | 'spawn',
  now: Date = new Date(),
): string {
  const parsed = t.dueAt == null ? null : t.dueAt instanceof Date ? t.dueAt : new Date(t.dueAt);
  const due = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  if (t.contextName) {
    const emoji = nearestEmoji(t.contextColor);
    const label = emoji ? `${emoji} ${t.contextName}` : t.contextName;
    if (kind === 'spawn') return `${label} · new`;
    return due ? `${label} · ${relativeTime(due, now)}` : label;
  }

  // No context → the whole title is the relative-time slot.
  if (kind === 'spawn') return 'new';
  return due ? relativeTime(due, now) : 'Task';
}
