// Compute the next instance date (YYYY-MM-DD) for a recurrence rule, for the
// "Наступний інстанс" display. Rules: 'daily' | 'weekly:<dow>' | 'monthly:<N>'.
// The scheduler that actually spawns instances is Phase 2.
const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextInstance(rule: string, from: Date = new Date()): string | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (rule === 'daily') {
    base.setDate(base.getDate() + 1);
    return fmt(base);
  }

  const [kind, arg] = rule.split(':');

  if (kind === 'weekly') {
    const target = WEEKDAYS[(arg ?? '').toLowerCase()];
    if (target == null) return null;
    let diff = (target - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // always the *next* occurrence
    base.setDate(base.getDate() + diff);
    return fmt(base);
  }

  if (kind === 'monthly') {
    const day = Number.parseInt(arg ?? '', 10);
    if (!day) return null;
    const d = new Date(base);
    if (base.getDate() < day) {
      d.setDate(day);
    } else {
      d.setMonth(d.getMonth() + 1, day);
    }
    return fmt(d);
  }

  return null;
}
