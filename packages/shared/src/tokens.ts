// Design tokens from the redesign canvas (13 artboards). Dark theme only.

export const colors = {
  bgBase: '#0B0E13', // page
  bgSurface: '#12171E', // phone frame / main
  bgCard: '#161B22', // task cards, inputs (mobile)
  bgCardWeb: '#171C24', // task cards (web)
  bgElevated: '#262D39', // badges, secondary buttons
  bgControl: '#151B23', // icon buttons, chips
  borderSubtle: '#1F2630',
  borderStrong: '#242B35',
  borderControl: '#222934', // icon buttons, chips
  textPrimary: '#E9EEF4',
  textSecondary: '#7A8492',
  textControl: '#8B95A2', // chip labels, secondary icons
  textMuted: '#4E5865',
  textFaint: '#3A4150',
  accentPrimary: '#E9A23B', // amber — CTA, active tab, "today"
  accentTimer: '#3FC9A8', // teal — active timer, done
  accentReminder: '#9B7EDE', // violet — reminders
  accentNow: '#E8608C', // rose — "now" line, overdue
} as const;

export type Palette = Record<keyof typeof colors, string>;

export const radius = {
  card: 12, // rounded-xl
  sheet: 24, // sheet/modal top radius
} as const;

export const contextStripWidth = 3; // border-left px on each card

// The two work contexts seeded into a new account. Colors are used consistently everywhere.
export const seedContexts = [
  { slug: 'routine', label: 'Routine', color: '#C77DD6', excludeFromAll: true },
  { slug: 'meetings', label: 'Meetings', color: '#4FB6A9', excludeFromAll: false },
] as const;
