import type { Dictionary } from '../types';

export const reminders: Pick<Dictionary, keyof typeof import('../en/reminders').reminders> = {
  'reminders.modal.label': 'PRZYPOMNIENIE',
  'reminders.modal.dismiss': 'Odrzuć',
  'reminders.snooze.minutes': 'Odłóż o {n} min',
  'reminders.snooze.hour': 'Odłóż o 1 godzinę',
  'reminders.notification.fallbackTitle': 'Przypomnienie',
  'reminders.summary.greeting': 'Dzień dobry',
  'reminders.summary.checking': 'Sprawdzamy, co jest jeszcze otwarte…',
  'reminders.summary.yesterdayCount': 'Zostało z wczoraj: {n}',
  'reminders.summary.olderCount': 'Starsze zaległe: {n}',
  'reminders.summary.notNow': 'Nie teraz',
  'reminders.summary.wasDue': 'termin minął {when}',
  'reminders.summary.moveToToday': 'Przenieś „{title}” na dziś',
  'reminders.summary.clearTime': 'Usuń zaplanowany czas dla „{title}”',
  'reminders.channel.default': 'Przypomnienia o zadaniach',
  'reminders.channel.critical': 'Ważne przypomnienia o zadaniach',
};
