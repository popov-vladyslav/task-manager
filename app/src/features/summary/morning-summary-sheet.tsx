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
import { colors, monoFont, radius, shortDateTime, WIDE_BREAKPOINT } from '../../theme';
import { haptics } from '../../lib/haptics';
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
  loading,
  yesterday,
  older,
}: {
  loading: boolean;
  yesterday: Task[];
  older: Task[];
}): string {
  if (loading && yesterday.length + older.length === 0) return 'Checking what is still open…';
  if (yesterday.length === 0 && older.length === 0)
    return 'Nothing was left unfinished. Clear slate.';
  const olderPart = `${older.length} older overdue`;
  if (yesterday.length === 0) return olderPart;
  const yesterdayPart = `${yesterday.length} left from yesterday`;
  return older.length ? `${yesterdayPart} · ${olderPart}` : yesterdayPart;
}

function SummaryContent({ onClose }: { onClose: () => void }) {
  const { yesterday, older, loading } = useSummaryStore();
  const [showOlder, setShowOlder] = useState(false);

  const total = yesterday.length + older.length;

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Sunrise size={18} color={colors.accentPrimary} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Good morning</Text>
          <Text style={styles.subtitle}>{summaryLine({ loading, yesterday, older })}</Text>
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
          <Text style={styles.sectionLabel}>YESTERDAY</Text>
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
            <Text style={styles.sectionLabel}>{older.length} OLDER OVERDUE</Text>
          </Pressable>
          {showOlder ? older.map((t) => <SummaryRow key={t.id} task={t} />) : null}
        </View>
      ) : null}

      {total > 0 ? (
        <Pressable onPress={onClose} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Not now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryRow({ task }: { task: Task }) {
  const { rescheduleToToday, clearDueDate, busyIds } = useSummaryStore();
  const busy = busyIds.includes(task.id);

  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {task.title}
        </Text>
        <Text style={styles.rowDue}>was due {shortDateTime(task.dueAt)}</Text>
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
            accessibilityLabel={`Move ${task.title} to today`}
            style={styles.todayBtn}
          >
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.select();
              void clearDueDate(task);
            }}
            accessibilityLabel={`Clear the scheduled time of ${task.title}`}
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
