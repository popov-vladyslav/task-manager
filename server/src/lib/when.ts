export const APP_TZ = 'Europe/Warsaw';

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClock(at: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts.formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

function offsetMs(at: Date): number {
  const w = wallClock(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - at.getTime();
}

export function parseWhen(input: string): Date {
  const s = input.trim();
  const m = NAIVE.exec(s);
  if (!m) return new Date(s);
  const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

export function fmtWhen(value: string | Date): string {
  const at = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(at.getTime())) return String(value);
  const w = wallClock(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
}
