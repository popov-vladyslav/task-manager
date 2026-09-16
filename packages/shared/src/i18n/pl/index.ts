import type { Dictionary } from '../types';
import { common } from './common';
import { tasks } from './tasks';
import { when } from './when';
import { contexts } from './contexts';
import { calendar } from './calendar';
import { settings } from './settings';
import { timer } from './timer';
import { reminders } from './reminders';
import { auth } from './auth';
import { nav } from './nav';
import { toasts } from './toasts';
import { push } from './push';

export const pl: Dictionary = {
  ...common,
  ...tasks,
  ...when,
  ...contexts,
  ...calendar,
  ...settings,
  ...timer,
  ...reminders,
  ...auth,
  ...nav,
  ...toasts,
  ...push,
};
