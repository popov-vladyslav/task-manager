import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronRight, ListTodo, Plus, RotateCcw, X } from 'lucide-react-native';
import { DraggableTaskList } from './draggable-task-list';
import type { Context, Task } from '@task-manager/shared';
import { colors, headerDate, monoFont } from '../../theme';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { TaskCard } from './task-card';
import { ContextChips } from './context-chips';
import { TaskDetail } from './task-detail';

const WIDE_BREAKPOINT = 768;

export function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const {
    contexts,
    tasks,
    activeContextId,
    loading,
    load,
    setActiveContext,
    addTask,
    toggleComplete,
    patchTask,
    removeTask,
    reorder,
  } = useTasksStore();

  const [selected, setSelected] = useState<Task | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  // Keep the open detail in sync with store updates (e.g. after a patch).
  useEffect(() => {
    if (!selected) return;
    const fresh = tasks.find((t) => t.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [tasks, selected]);

  const contextById = useMemo(() => {
    const m = new Map<number, Context>();
    for (const c of contexts) m.set(c.id, c);
    return m;
  }, [contexts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tasks.length };
    for (const t of tasks) if (t.contextId != null) c[String(t.contextId)] = (c[String(t.contextId)] ?? 0) + 1;
    return c;
  }, [tasks]);

  const visible = useMemo(() => {
    const list =
      activeContextId == null ? [...tasks] : tasks.filter((t) => t.contextId === activeContextId);
    const key = activeContextId == null ? 'sortGlobal' : 'sortContext';
    return list.sort((a, b) => a[key] - b[key]);
  }, [tasks, activeContextId]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const onToggle = (task: Task) => {
    toggleComplete(task);
    flash(task.recurrenceId ? 'Done. Next instance scheduled.' : 'Done ✓');
  };

  const submitAdd = async () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setDraft('');
    setAdding(false);
    const created = await addTask(title);
    if (created) setSelected(created); // open detail to configure, per the design
  };

  const list =
    loading && visible.length === 0 ? (
      <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: 40 }} />
    ) : visible.length === 0 ? (
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No open tasks</Text>
    ) : (
      <DraggableTaskList
        tasks={visible}
        onReorder={(movedId, afterId, beforeId) =>
          reorder(movedId, afterId, beforeId, activeContextId == null ? 'global' : 'context')
        }
        renderCard={(item, drag) => (
          <TaskCard
            task={item}
            context={item.contextId != null ? contextById.get(item.contextId) : undefined}
            onToggle={() => onToggle(item)}
            onOpen={() => setSelected(item)}
            showGrip={!wide}
            onDrag={drag}
          />
        )}
      />
    );

  const addRow = adding ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 12,
        borderCurve: 'continuous',
        padding: 8,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.bgElevated,
      }}
    >
      <TextInput
        autoFocus
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submitAdd}
        placeholder="New task…"
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, paddingHorizontal: 8, fontSize: 14, color: colors.textPrimary }}
      />
      <Pressable onPress={submitAdd} style={{ padding: 8, borderRadius: 8, backgroundColor: colors.accentPrimary }}>
        <ChevronRight size={15} color={colors.bgSurface} />
      </Pressable>
      <Pressable
        onPress={() => {
          setAdding(false);
          setDraft('');
        }}
        style={{ padding: 8, borderRadius: 8, backgroundColor: colors.bgElevated }}
      >
        <X size={15} color={colors.textSecondary} />
      </Pressable>
    </View>
  ) : (
    <Pressable
      onPress={() => setAdding(true)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderCurve: 'continuous',
        paddingVertical: 11,
        backgroundColor: colors.accentPrimary,
      }}
    >
      <Plus size={16} color={colors.bgSurface} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.bgSurface }}>Add task</Text>
    </Pressable>
  );

  const toastNode = toast ? (
    <View
      style={{
        position: 'absolute',
        alignSelf: 'center',
        bottom: 96,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: colors.bgElevated,
        borderWidth: 1,
        borderColor: colors.borderStrong,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.textPrimary }}>{toast}</Text>
    </View>
  ) : null;

  const detailNode = selected ? (
    <TaskDetail
      task={selected}
      contexts={contexts}
      onClose={() => setSelected(null)}
      onPatch={patchTask}
      onDelete={removeTask}
    />
  ) : null;

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    const activeLabel = activeContextId == null ? 'All tasks' : contextById.get(activeContextId)?.label ?? '';
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase }}>
        <View
          style={{
            width: 240,
            paddingTop: insets.top + 16,
            paddingHorizontal: 16,
            paddingBottom: 16,
            backgroundColor: '#10141B',
            borderRightWidth: 1,
            borderRightColor: colors.bgCard,
          }}
        >
          <View style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
            <Text style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: 2, color: colors.textMuted }}>LOG</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
              {headerDate().replace('LOG — ', '')}
            </Text>
          </View>

          <SidebarNav label="Tasks" icon={<ListTodo size={16} color={colors.accentPrimary} />} active />
          <SidebarNav label="Routine" icon={<RotateCcw size={16} color={colors.textMuted} />} onPress={() => flash('Routine arrives in a later phase')} />
          <SidebarNav label="Calendar" icon={<CalendarDays size={16} color={colors.textMuted} />} onPress={() => flash('Calendar arrives in a later phase')} />

          <Text style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: 1, color: colors.textFaint, marginTop: 20, marginBottom: 8, paddingHorizontal: 8 }}>
            CONTEXTS
          </Text>
          <SidebarContext label="All" dot={colors.textSecondary} count={counts.all ?? 0} active={activeContextId == null} onPress={() => setActiveContext(null)} />
          {contexts.map((c) => (
            <SidebarContext
              key={c.id}
              label={c.label}
              dot={c.color}
              count={counts[String(c.id)] ?? 0}
              active={activeContextId === c.id}
              onPress={() => setActiveContext(c.id)}
            />
          ))}

          <View style={{ flex: 1 }} />
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingTop: insets.top + 24, paddingHorizontal: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 760 }}>
            <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>{activeLabel}</Text>
            {!adding ? (
              <Pressable
                onPress={() => setAdding(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.accentPrimary }}
              >
                <Plus size={14} color={colors.bgSurface} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bgSurface }}>Task</Text>
              </Pressable>
            ) : null}
          </View>
          {adding ? <View style={{ maxWidth: 760, marginBottom: 12 }}>{addRow}</View> : null}
          <View style={{ flex: 1, maxWidth: 760 }}>{list}</View>
        </View>

        {toastNode}
        {detailNode}
      </View>
    );
  }

  // ---- MOBILE / NARROW: header + chips + list + add + tabs ----
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted }}>{headerDate()}</Text>
        <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>
          {tasks.length} open {tasks.length === 1 ? 'task' : 'tasks'}
        </Text>
      </View>

      <ContextChips contexts={contexts} counts={counts} activeContextId={activeContextId} onSelect={setActiveContext} />

      <View style={{ flex: 1 }}>{list}</View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>{addRow}</View>

      {/* Bottom tabs — Tasks active; Routine/Calendar are later phases. */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.bgCard,
          paddingBottom: insets.bottom,
          backgroundColor: colors.bgSurface,
        }}
      >
        <Tab label="Tasks" icon={<ListTodo size={20} color={colors.accentPrimary} />} active />
        <Tab label="Routine" icon={<RotateCcw size={20} color={colors.textMuted} />} onPress={() => flash('Routine arrives in a later phase')} />
        <Tab label="Calendar" icon={<CalendarDays size={20} color={colors.textMuted} />} onPress={() => flash('Calendar arrives in a later phase')} />
      </View>

      {toastNode}
      {detailNode}
    </View>
  );
}

function SidebarNav({ label, icon, active, onPress }: { label: string; icon: ReactNode; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 4,
        backgroundColor: active ? colors.bgCard : 'transparent',
      }}
    >
      {icon}
      <Text style={{ fontSize: 13.5, fontWeight: '500', color: active ? colors.textPrimary : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

function SidebarContext({ label, dot, count, active, onPress }: { label: string; dot: string; count: number; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginBottom: 2,
        backgroundColor: active ? colors.bgCard : 'transparent',
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ flex: 1, fontSize: 12.5, color: active ? colors.textPrimary : colors.textSecondary }}>{label}</Text>
      <Text style={{ fontFamily: monoFont, fontSize: 10, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{count}</Text>
    </Pressable>
  );
}

function Tab({ label, icon, active, onPress }: { label: string; icon: ReactNode; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 6, gap: 3 }}>
      {icon}
      <Text style={{ fontSize: 10, color: active ? colors.accentPrimary : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}
