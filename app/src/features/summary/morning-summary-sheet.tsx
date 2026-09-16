import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { CalendarOff, ChevronDown, ChevronRight, Sunrise, X } from 'lucide-react-native';
import type { Task } from '@task-manager/shared';
import { colors, monoFont, radius, WIDE_BREAKPOINT } from '../../theme';
import { haptics } from '../../lib/haptics';
import { useIntlTag, useT, type T } from '../../lib/i18n';
import { useSummaryStore } from '../../store/summary';

// The morning summary: yesterday's unfinished tasks, each actionable in one tap
// (move to today / drop the scheduled time), plus the older overdue pile behind a
// collapsed section — that list can be long and stale, so it must not dominate.
//
// Opens once per calendar day on first app open, and whenever the morning
// notification is tapped. Recurring occurrences are never listed (server-side).

export function MorningSummarySheet() {
  const visible = useSummaryStore((s) => s.visible);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  if (!visible) return null;
  return wide ? <WideModal /> : <Sheet />;
}

function WideModal() {
  const close = useSummaryStore((s) => s.close);
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable onPress={close} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <SummaryContent onClose={close} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Sheet() {
  const ref = useRef<BottomSheetModal>(null);
  const close = useSummaryStore((s) => s.close);

  useEffect(() => {
    ref.current?.present();
  }, []);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={close}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.sheetHandle}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        <SummaryContent onClose={() => ref.current?.dismiss()} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// Only mentions the buckets that actually have something in them — "0 left from
// yesterday" reads like a bug when the pile is purely historical.
function summaryLine({
  tr,
  loading,
  yesterday,
  older,
}: {
  tr: T;
  loading: boolean;
  yesterday: Task[];
  older: Task[];
}): string {
  if (loading && yesterday.length + older.length === 0) return tr('reminders.summary.checking');
  if (yesterday.length === 0 && older.length === 0) return tr('summary.empty');
  const olderPart = tr('reminders.summary.olderCount', { n: older.length });
  if (yesterday.length === 0) return olderPart;
  const yesterdayPart = tr('reminders.summary.yesterdayCount', { n: yesterday.length });
  return older.length ? `${yesterdayPart} · ${olderPart}` : yesterdayPart;
}

function SummaryContent({ onClose }: { onClose: () => void }) {
  const { yesterday, older, loading } = useSummaryStore();
  const [showOlder, setShowOlder] = useState(false);
  const tr = useT();

  const total = yesterday.length + older.length;

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Sunrise size={18} color={colors.accentPrimary} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{tr('reminders.summary.greeting')}</Text>
          <Text style={styles.subtitle}>{summaryLine({ tr, loading, yesterday, older })}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading && total === 0 ? (
        <ActivityIndicator color={colors.accentPrimary} style={styles.spinner} />
      ) : null}

      {yesterday.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{tr('common.yesterday').toUpperCase()}</Text>
          {yesterday.map((t) => (
            <SummaryRow key={t.id} task={t} />
          ))}
        </View>
      ) : null}

      {older.length > 0 ? (
        <View style={styles.section}>
          {/* Collapsed by default: this pile is old and can be long, so it must not
              bury yesterday's actionable list. */}
          <Pressable onPress={() => setShowOlder((v) => !v)} style={styles.olderToggle}>
            {showOlder ? (
              <ChevronDown size={13} color={colors.textMuted} />
            ) : (
              <ChevronRight size={13} color={colors.textMuted} />
            )}
            <Text style={styles.sectionLabel}>
              {tr('reminders.summary.olderCount', { n: older.length }).toUpperCase()}
            </Text>
          </Pressable>
          {showOlder ? older.map((t) => <SummaryRow key={t.id} task={t} />) : null}
        </View>
      ) : null}

      {total > 0 ? (
        <Pressable onPress={onClose} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>{tr('reminders.summary.notNow')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryRow({ task }: { task: Task }) {
  const { rescheduleToToday, clearDueDate, busyIds } = useSummaryStore();
  const busy = busyIds.includes(task.id);
  const tr = useT();
  const intlTag = useIntlTag();
  const dueLabel = task.dueAt
    ? new Date(task.dueAt).toLocaleString(intlTag, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {task.title}
        </Text>
        {dueLabel ? (
          <Text style={styles.rowDue}>{tr('reminders.summary.wasDue', { when: dueLabel })}</Text>
        ) : null}
      </View>

      {busy ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={styles.rowSpinner} />
      ) : (
        <View style={styles.rowActions}>
          <Pressable
            onPress={() => {
              haptics.select();
              void rescheduleToToday(task);
            }}
            accessibilityLabel={tr('reminders.summary.moveToToday', { title: task.title })}
            style={styles.todayBtn}
          >
            <Text style={styles.todayText}>{tr('common.today')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.select();
              void clearDueDate(task);
            }}
            accessibilityLabel={tr('reminders.summary.clearTime', { title: task.title })}
            style={styles.clearBtn}
          >
            <CalendarOff size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,6,10,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: 520,
    maxWidth: '100%',
    maxHeight: '85%',
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetHandle: { backgroundColor: colors.borderStrong },
  sheetBackground: { backgroundColor: colors.bgCardWeb },
  scrollContent: { padding: 20, paddingBottom: 28 },
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { padding: 7, borderRadius: 9, backgroundColor: colors.bgCard },
  spinner: { marginVertical: 12 },
  section: { gap: 8 },
  sectionLabel: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: colors.textFaint,
  },
  olderToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.card,
    backgroundColor: colors.bgCard,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, color: colors.textPrimary },
  rowDue: { fontFamily: monoFont, fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSpinner: { marginHorizontal: 12 },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.accentPrimary,
  },
  todayText: { fontSize: 12.5, fontWeight: '600', color: colors.bgSurface },
  clearBtn: { padding: 8, borderRadius: 9, backgroundColor: colors.bgElevated },
  dismissBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  dismissText: { fontSize: 13, color: colors.textMuted },
});
