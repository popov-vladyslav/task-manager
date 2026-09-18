import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  Eye,
  EyeOff,
  LayoutList,
  Pencil,
  Plus,
  Trash2,
  type LucideProps,
} from 'lucide-react-native';
import { contextEmoji } from '@task-manager/shared';
import { BottomSheet } from '../../components/bottom-sheet';
import { ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useTasksStore } from '../../store/tasks';
import { useUiStore } from '../../store/ui';
import { openCounts } from '../../store/task-selectors';
import { useTheme, type Theme } from '../../theme';
import { SectionNameSheet } from './section-name-sheet';

function MenuItem({
  icon: Icon,
  label,
  onPress,
  danger,
  trailing,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const color = danger ? t.colors.accentNow : t.colors.textControl;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Icon size={18} color={color} strokeWidth={1.8} />
      <Text style={[styles.itemLabel, danger && styles.itemDanger]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

export function ContextMenuSheet() {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const open = useUiStore((s) => s.contextMenuOpen);
  const close = useUiStore((s) => s.closeContextMenu);
  const openEditor = useUiStore((s) => s.openContextEditor);
  const openSectionsSheet = useUiStore((s) => s.openSectionsSheet);
  const createSection = useTasksStore((s) => s.createSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const contexts = useTasksStore((s) => s.contexts);
  const tasks = useTasksStore((s) => s.tasks);
  const activeContextId = useTasksStore((s) => s.activeContextId);
  const updateContext = useTasksStore((s) => s.updateContext);
  const deleteContext = useTasksStore((s) => s.deleteContext);
  const [error, setError] = useState<string | null>(null);

  const context = contexts.find((c) => c.id === activeContextId);
  const count = useMemo(
    () => (context ? (openCounts(tasks, contexts)[String(context.id)] ?? 0) : 0),
    [tasks, contexts, context],
  );
  const tint = useMemo(
    () => StyleSheet.create({ emoji: { backgroundColor: `${context?.color ?? '#000000'}26` } }),
    [context?.color],
  );

  const toggleSections = () => {
    if (!context) return;
    updateContext(context.id, { sectionsEnabled: !context.sectionsEnabled }).catch(() =>
      setError(tr('contexts.editor.saveFailed')),
    );
  };

  const toggleHidden = async () => {
    if (!context) return;
    await updateContext(context.id, { excludeFromAll: !context.excludeFromAll });
    close();
  };

  const remove = async () => {
    if (!context) return;
    setError(null);
    try {
      await deleteContext(context.id);
      close();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? tr('contexts.menu.deleteBlocked')
          : e instanceof Error
            ? e.message
            : tr('contexts.menu.deleteFailed'),
      );
    }
  };

  return (
    <>
      <SectionNameSheet
        open={newSectionOpen}
        title={tr('contexts.section.new')}
        onClose={() => setNewSectionOpen(false)}
        onSubmit={async (name) => {
          if (!context) return;
          const created = await createSection(context.id, name);
          setActiveSection(context.id, created.id);
        }}
      />
      <BottomSheet open={open && !!context} onClose={close} padded={false}>
        {context ? (
          <>
            <View style={styles.head}>
              <View style={[styles.emojiBox, tint.emoji]}>
                <Text style={styles.emoji}>{contextEmoji(context) ?? ''}</Text>
              </View>
              <View>
                <Text style={styles.name}>{context.label}</Text>
                <Text style={styles.sub}>
                  {tr(count === 1 ? 'contexts.menu.taskCountOne' : 'contexts.menu.taskCount', {
                    n: count,
                  })}
                </Text>
              </View>
            </View>
            <View style={styles.group}>
              <MenuItem
                icon={LayoutList}
                label={tr('contexts.editor.sections')}
                onPress={toggleSections}
                trailing={
                  <Switch
                    value={context.sectionsEnabled}
                    onValueChange={toggleSections}
                    trackColor={{ false: t.colors.bgElevated, true: t.colors.accentPrimary }}
                    thumbColor={t.colors.textPrimary}
                  />
                }
              />
              <MenuItem
                icon={Plus}
                label={tr('contexts.section.new')}
                onPress={() => {
                  close();
                  setNewSectionOpen(true);
                }}
              />
              <MenuItem
                icon={Pencil}
                label={tr('contexts.section.manage')}
                onPress={openSectionsSheet}
              />
              <View style={styles.divider} />
              <MenuItem
                icon={Pencil}
                label={tr('contexts.menu.rename')}
                onPress={() => openEditor(context.id)}
                trailing={<View style={[styles.dot, { backgroundColor: context.color }]} />}
              />
              <MenuItem
                icon={context.excludeFromAll ? Eye : EyeOff}
                label={
                  context.excludeFromAll
                    ? tr('contexts.menu.showInAll')
                    : tr('contexts.editor.hideFromAll')
                }
                onPress={toggleHidden}
              />
              <MenuItem icon={Trash2} label={tr('contexts.menu.delete')} onPress={remove} danger />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderColor: t.colors.borderSubtle,
    },
    emojiBox: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 14 },
    name: { fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
    sub: { fontFamily: t.fonts.mono, fontSize: 11.5, color: t.colors.textMuted, marginTop: 2 },
    group: { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 10 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      padding: 12,
      borderRadius: 11,
    },
    itemPressed: { backgroundColor: t.colors.bgControl },
    itemLabel: { flex: 1, fontSize: 14.5, fontWeight: '600', color: t.colors.textPrimary },
    itemDanger: { color: t.colors.accentNow },
    dot: { width: 11, height: 11, borderRadius: 6 },
    divider: {
      height: 1,
      backgroundColor: t.colors.borderSubtle,
      marginVertical: 6,
      marginHorizontal: 4,
    },
    error: { fontSize: 12.5, color: t.colors.accentNow, paddingHorizontal: 22, paddingBottom: 8 },
  });
