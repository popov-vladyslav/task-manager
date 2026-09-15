import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, Clock } from 'lucide-react-native';
import type { Context, Task } from '@task-manager/shared';
import { Header } from '../../components/header';
import { AddChip, Chip, ChipRow } from '../../components/chip';
import { TaskRow } from '../../components/task-row';
import { BottomSheet } from '../../components/bottom-sheet';
import { Popover, usePopoverAnchor } from '../../components/popover';
import { useTheme, type Theme } from '../../theme';

const work: Context = {
  id: 1,
  slug: 'work',
  label: 'Work',
  color: '#E8608C',
  sortOrder: 0,
  archived: false,
  excludeFromAll: false,
  emoji: null,
};
const home: Context = { ...work, id: 2, slug: 'home', label: 'Home', color: '#4CA8F6' };

const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
const inTwoHours = new Date(Date.now() + 7_200_000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();

function sample(id: string, title: string, patch: Partial<Task>): Task {
  return {
    id,
    title,
    contextId: 1,
    status: 'active',
    dueAt: null,
    remindAt: null,
    durationMin: null,
    trackedSec: 0,
    sortGlobal: 0,
    sortContext: 0,
    recurrenceId: null,
    recurrenceRule: null,
    completedAt: null,
    createdAt: hourAgo,
    createdVia: 'app',
    note: null,
    nextInstance: null,
    ...patch,
  };
}

const tasks: { task: Task; context: Context }[] = [
  {
    task: sample('1', 'Resolve every comment in the pull request', {
      dueAt: hourAgo,
      durationMin: 30,
      trackedSec: 4320,
    }),
    context: work,
  },
  {
    task: sample('2', 'Photograph the repair and send it over', { dueAt: nextWeek, contextId: 2 }),
    context: home,
  },
  {
    task: sample('3', 'Team sync', {
      dueAt: inTwoHours,
      durationMin: 30,
      recurrenceId: 'r1',
      recurrenceRule: 'weekly:tue',
    }),
    context: work,
  },
  { task: sample('4', 'Find someone who can help with the job hunt', {}), context: work },
  {
    task: sample('5', 'Pay the land tax', { status: 'done', completedAt: hourAgo }),
    context: home,
  },
];

export default function DemoRoute() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [section, setSection] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const popover = usePopoverAnchor();

  return (
    <View style={styles.screen}>
      <Header title="Work" emoji="💼" onTitlePress={popover.open} titleRef={popover.ref} />
      <ScrollView contentContainerStyle={styles.content}>
        <ChipRow>
          <Chip
            label="Inbox"
            count={2}
            selected={section === 0}
            tint={work.color}
            onPress={() => setSection(0)}
          />
          <Chip
            label="In progress"
            count={1}
            selected={section === 1}
            tint={work.color}
            onPress={() => setSection(1)}
          />
          <Chip
            label="Review"
            selected={section === 2}
            tint={work.color}
            onPress={() => setSection(2)}
          />
          <AddChip accessibilityLabel="Add section" />
        </ChipRow>

        <ChipRow>
          <Chip
            label="Today, 18:00"
            icon={<Clock size={14} color={t.colors.accentPrimary} />}
            selected
          />
          <Chip label="Remind" icon={<Bell size={14} color={t.colors.textControl} />} />
          <Chip label="Repeat" />
        </ChipRow>

        <View style={styles.rows}>
          {tasks.map(({ task, context }) => (
            <TaskRow
              key={task.id}
              task={task}
              context={context}
              showContext
              hasNote={task.id === '1'}
              onPlay={() => {}}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          <Pressable onPress={() => setSheetOpen(true)} style={styles.button}>
            <Text style={styles.buttonText}>Open sheet</Text>
          </Pressable>
          <Pressable onPress={popover.open} style={styles.button}>
            <Text style={styles.buttonText}>Open popover</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Bottom sheet</Text>
        <Text style={styles.sheetBody}>Gorhom on mobile, centred card on wide viewports.</Text>
      </BottomSheet>

      <Popover anchor={popover.anchor} onClose={popover.close}>
        {[work, home].map((c) => (
          <View key={c.id} style={styles.popRow}>
            <Text style={styles.popName}>{c.label}</Text>
            <Text style={styles.popCount}>{c.id === 1 ? 3 : 20}</Text>
          </View>
        ))}
      </Popover>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bgBase },
    content: { paddingBottom: 40 },
    rows: { paddingHorizontal: 16, gap: 8 },
    buttons: { flexDirection: 'row', gap: 10, padding: 16 },
    button: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { color: t.colors.textPrimary, fontWeight: '600', fontSize: 13.5 },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: t.colors.textPrimary },
    sheetBody: { fontSize: 14, color: t.colors.textSecondary },
    popRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    popName: { flex: 1, fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
    popCount: {
      fontFamily: t.fonts.mono,
      fontSize: 11.5,
      fontWeight: '700',
      color: t.colors.textMuted,
    },
  });
