import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerReminderCategory, snoozeMinutesFor } from '../../lib/push';
import { api } from '../../lib/api';
import { currentT } from '../../lib/i18n';
import { useLocaleStore } from '../../store/locale';
import { useTasksStore } from '../../store/tasks';
import { useSummaryStore } from '../../store/summary';
import { useRemindersStore } from '../../store/reminders';

// Native-only bridge for reminder notifications. Rendered only on native — the
// response hook (getLastNotificationResponse) isn't available on web. Handles:
// snooze action buttons (reschedule), plain taps (open the task), and foreground
// arrivals (blocking in-app modal).
export function NotificationBridge() {
  const locale = useLocaleStore((s) => s.locale);
  useEffect(() => {
    registerReminderCategory();
  }, [locale]);

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse) return;
    const content = lastResponse.notification.request.content;

    // The morning summary carries a count, not a task: tapping it opens the
    // review sheet where the tasks can be moved to today or unscheduled.
    if (content.data?.kind === 'morning-summary') {
      router.navigate('/'); // Tasks tab
      void useSummaryStore.getState().open();
      return;
    }

    const taskId = content.data?.taskId;
    if (typeof taskId !== 'string') return;
    const minutes = snoozeMinutesFor(lastResponse.actionIdentifier);
    if (minutes != null) {
      api.snoozeTask(taskId, minutes).catch(() => {});
      return;
    }
    router.navigate('/'); // Tasks tab
    useTasksStore.getState().requestOpenTask(taskId);
  }, [lastResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const content = n.request.content;
      const taskId = content.data?.taskId;
      if (typeof taskId === 'string') {
        const tr = currentT();
        useRemindersStore.getState().show({
          taskId,
          title: content.body ?? content.title ?? tr('reminders.notification.fallbackTitle'),
        });
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
