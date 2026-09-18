// Design tokens from the redesign canvas (13 artboards). Dark theme only.

export const colors = {
  bgBase: '#0B0E13', // page
  bgSurface: '#12171E', // phone frame / main
  bgCard: '#161B22', // task cards, inputs (mobile)
  bgCardWeb: '#171C24', // task cards (web)
  bgElevated: '#262D39', // badges, secondary buttons
  bgControl: '#151B23', // icon buttons, chips
  bgPopover: '#171E27',
  borderSubtle: '#1F2630',
  borderStrong: '#242B35',
  borderControl: '#222934', // icon buttons, chips
  borderPopover: '#2C3644',
  handle: '#2B333F', // sheet grab handle
  scrim: 'rgba(4,6,10,0.7)',
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
  card: 14,
  sheet: 20, // sheet/modal top radius
  popover: 16,
} as const;

export const contextStripWidth = 3; // border-left px on each card

export const contextPalette = [
  '#5597E9', // blue
  '#6D74D8', // indigo
  '#A479DE', // violet
  '#C770C1', // magenta
  '#E78AAA', // pink
  '#DF6862', // red
  '#E7844D', // orange
  '#EEA743', // amber
  '#E6CE57', // yellow
  '#9DCD53', // lime
  '#5DB96E', // green
  '#3DB8A7', // teal
  '#49BFD9', // cyan
  '#9A7050', // brown
  '#8B93A3', // slate
] as const;

// The two work contexts seeded into a new account. Colors are used consistently everywhere.
export const seedContexts = [
  { slug: 'routine', label: 'Routine', color: '#C770C1', excludeFromAll: true },
  { slug: 'meetings', label: 'Meetings', color: '#3DB8A7', excludeFromAll: false },
] as const;
