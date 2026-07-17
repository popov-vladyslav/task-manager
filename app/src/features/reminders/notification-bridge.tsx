import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerReminderCategory, snoozeMinutesFor } from '../../lib/push';
import { api } from '../../lib/api';
import { useTasksStore } from '../../store/tasks';
import { useRemindersStore } from '../../store/reminders';

// Native-only bridge for reminder notifications. Rendered only on native — the
// response hook (getLastNotificationResponse) isn't available on web. Handles:
// snooze action buttons (reschedule), plain taps (open the task), and foreground
// arrivals (blocking in-app modal).
export function NotificationBridge() {
  useEffect(() => {
    registerReminderCategory();
  }, []);

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse) return;
    const content = lastResponse.notification.request.content;
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
        useRemindersStore.getState().show({ taskId, title: content.body ?? content.title ?? 'Reminder' });
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
