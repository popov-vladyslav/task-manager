// Design tokens transcribed from design/uploads/claude_design_brief.md.
// Source of truth for any conflict: the .dc.html bundles. Dark theme only.

export const colors = {
  bgBase: '#0B0E13', // page
  bgSurface: '#14181F', // phone frame / main
  bgCard: '#1C222C', // task cards, inputs (mobile)
  bgCardWeb: '#171C24', // task cards (web)
  bgElevated: '#262D39', // badges, secondary buttons
  borderSubtle: '#262D39',
  borderStrong: '#3A4150',
  textPrimary: '#EDEFF3',
  textSecondary: '#8B93A3',
  textMuted: '#5A6272',
  textFaint: '#3A4150',
  accentPrimary: '#E8A33D', // amber — CTA, active tab, "today"
  accentTimer: '#4FB6A9', // teal — active timer, done
  accentReminder: '#9B7EDE', // violet — reminders
  accentNow: '#D9668B', // rose — "now" line
} as const;

export const radius = {
  card: 12, // rounded-xl
  sheet: 24, // sheet/modal top radius
} as const;

export const contextStripWidth = 3; // border-left px on each card

export const fonts = {
  ui: 'Inter',
  mono: 'JetBrainsMono',
} as const;

// The five work contexts seeded into the DB. Colors are used consistently everywhere.
export const seedContexts = [
  { slug: 'zt', label: 'ZT', color: '#5B8DEF' },
  { slug: 'da', label: 'DA', color: '#4FB6A9' },
  { slug: 'cairn', label: 'Cairn', color: '#E8A33D' },
  { slug: 'zalando', label: 'Zalando', color: '#D9668B' },
  { slug: 'home', label: 'Home', color: '#9B7EDE' },
] as const;
