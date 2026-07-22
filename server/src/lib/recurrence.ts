// Compute the next instance date (YYYY-MM-DD) for a recurrence rule, for the
// "Наступний інстанс" display. Rules: 'daily' | 'weekly:<dow>[,<dow>...]' | 'monthly:<N>'.
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

// Canonical weekday order for serializing a weekly rule.
const DOW_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Structured recurrence -> canonical rule string ('daily' | 'weekly:mon,wed' |
// 'monthly:15'). Dedupes/sorts/validates weekdays; throws on an empty weekly set
// so an unparseable rule can never be stored.
export function ruleFromSpec(spec: {
  freq: 'daily' | 'weekly' | 'monthly';
  days?: string[];
  dayOfMonth?: number;
}): string {
  if (spec.freq === 'daily') return 'daily';
  if (spec.freq === 'weekly') {
    const days = [...new Set((spec.days ?? []).map((d) => d.toLowerCase()))]
      .filter((d) => WEEKDAYS[d] != null)
      .sort((a, b) => DOW_ORDER.indexOf(a) - DOW_ORDER.indexOf(b));
    if (days.length === 0) throw new Error('Weekly recurrence needs at least one weekday.');
    return `weekly:${days.join(',')}`;
  }
  return `monthly:${spec.dayOfMonth ?? 1}`;
}

// 'mon,wed,fri' (or a legacy single 'mon') -> weekday numbers [1, 3, 5].
function parseWeeklyDays(arg: string | undefined): number[] {
  return (arg ?? '')
    .split(',')
    .map((d) => WEEKDAYS[d.trim().toLowerCase()])
    .filter((n): n is number => n != null);
}

// True if a recurring rule should spawn an instance on the given date.
export function ruleMatchesToday(rule: string, date: Date): boolean {
  if (rule === 'daily') return true;
  const [kind, arg] = rule.split(':');
  if (kind === 'weekly') return parseWeeklyDays(arg).includes(date.getDay());
  if (kind === 'monthly') return Number.parseInt(arg ?? '', 10) === date.getDate();
  return false;
}

// Expand title placeholders, e.g. 'Іпотека — {month}' -> 'Іпотека — липень'.
export function expandTitle(template: string, date: Date): string {
  return template
    .replace(/\{month\}/gi, date.toLocaleString('uk-UA', { month: 'long' }))
    .replace(/\{year\}/gi, String(date.getFullYear()));
}

export function nextInstance(rule: string, from: Date = new Date()): string | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (rule === 'daily') {
    base.setDate(base.getDate() + 1);
    return fmt(base);
  }

  const [kind, arg] = rule.split(':');

  if (kind === 'weekly') {
    const targets = parseWeeklyDays(arg);
    if (targets.length === 0) return null;
    // Nearest future matching weekday across all selected days.
    const diff = Math.min(
      ...targets.map((t) => {
        const d = (t - base.getDay() + 7) % 7;
        return d === 0 ? 7 : d; // always the *next* occurrence
      }),
    );
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

// Times to stamp on a freshly spawned instance (CR02 §1). Pure — unit-tested.
// - dueAt: only when the rule carries a default_due_time; the instance is then
//   dated (and shows on the calendar) at (spawn day + dueOffsetD) that time.
//   Null default_due_time → dateless instance (no calendar block).
// - remindAt: independent of the due date; from remind_time on the same day.
// Built in server-local time (deploy runs TZ=Europe/Warsaw), matching the rest
// of the scheduler.
export function computeInstanceTimes(
  rule: { defaultDueTime: string | null; remindTime: string | null; dueOffsetD: number | null },
  now: Date,
): { dueAt: Date | null; remindAt: Date | null } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (rule.dueOffsetD ?? 0));
  return {
    dueAt: atTime(day, rule.defaultDueTime),
    remindAt: atTime(day, rule.remindTime),
  };
}

// 'HH:MM' | 'HH:MM:SS' (drizzle `time`) applied to a day → Date, or null.
function atTime(day: Date, hhmm: string | null): Date | null {
  if (!hhmm) return null;
  const [hh, mm] = hhmm.split(':').map((n) => Number(n));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, mm || 0, 0, 0);
}
