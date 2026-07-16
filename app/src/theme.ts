import { colors, radius, contextStripWidth } from '@task-manager/shared';

export { colors, radius, contextStripWidth };

// Web-only: strip the default browser focus ring on text inputs — we show our own
// (accent border) instead. Spread into a TextInput style; a no-op on native.
export const webInputReset: object | undefined =
  process.env.EXPO_OS === 'web' ? { outlineStyle: 'none' } : undefined;

// Monospace family for the "engineering" labels/counters in the design.
export const monoFont =
  process.env.EXPO_OS === 'ios'
    ? 'Menlo'
    : process.env.EXPO_OS === 'android'
      ? 'monospace'
      : 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function headerDate(d: Date = new Date()): string {
  // e.g. "LOG — TUE, JUL 15"
  const s = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `LOG — ${s}`.toUpperCase();
}

export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function shortDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "2026-08-01" -> "Aug 1"
export function nextInstanceLabel(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
