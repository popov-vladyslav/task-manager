import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronRight } from 'lucide-react-native';
import type { Task } from '@task-manager/shared';
import { useTheme, type Theme } from '../../theme';

const WARSAW_TZ = 'Europe/Warsaw';

function warsawDayKey(iso: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: WARSAW_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

function completedDayLabel(key: string): string {
  if (!key) return 'Earlier';
  const now = Date.now();
  if (key === warsawDayKey(new Date(now).toISOString())) return 'Today';
  if (key === warsawDayKey(new Date(now - 86_400_000).toISOString())) return 'Yesterday';
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface CompletedGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export function groupCompletedByDay(tasks: Task[]): CompletedGroup[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.completedAt ? warsawDayKey(t.completedAt) : '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, ts]) => ({
      key,
      label: completedDayLabel(key),
      tasks: ts.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    }));
}

interface CompletedSectionProps {
  tasks: Task[];
  open: boolean;
  onToggle: () => void;
  onUncomplete: (task: Task) => void;
  onOpen: (task: Task) => void;
}

export function CompletedSection({
  tasks,
  open,
  onToggle,
  onUncomplete,
  onOpen,
}: CompletedSectionProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const groups = useMemo(() => groupCompletedByDay(tasks), [tasks]);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onToggle} accessibilityRole="button" style={styles.toggle}>
        {open ? (
          <ChevronDown size={14} color={t.colors.textMuted} />
        ) : (
          <ChevronRight size={14} color={t.colors.textMuted} />
        )}
        <Text style={styles.toggleLabel}>{open ? 'HIDE COMPLETED' : 'SHOW COMPLETED'}</Text>
      </Pressable>
      {open ? (
        tasks.length === 0 ? (
          <Text style={styles.none}>No completed tasks</Text>
        ) : (
          groups.map((g) => (
            <View key={g.key || 'earlier'} style={styles.group}>
              <Text style={styles.groupLabel}>{g.label.toUpperCase()}</Text>
              {g.tasks.map((task) => (
                <Pressable key={task.id} onPress={() => onOpen(task)} style={styles.row}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      onUncomplete(task);
                    }}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Reopen ${task.title}`}
                    style={styles.check}
                  >
                    <Check size={12} color={t.colors.bgBase} />
                  </Pressable>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))
        )
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 8 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
    toggleLabel: {
      fontFamily: t.fonts.mono,
      fontSize: 11,
      letterSpacing: 1,
      color: t.colors.textMuted,
    },
    none: { color: t.colors.textFaint, fontSize: 13, paddingVertical: 6 },
    group: { marginTop: 4 },
    groupLabel: {
      fontFamily: t.fonts.mono,
      fontSize: 10,
      letterSpacing: 1,
      color: t.colors.textFaint,
      marginTop: 10,
      marginBottom: 2,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: 0.6 },
    check: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.accentTimer,
    },
    rowTitle: {
      flex: 1,
      fontSize: 13,
      color: t.colors.textSecondary,
      textDecorationLine: 'line-through',
    },
  });
