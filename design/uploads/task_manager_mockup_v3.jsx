import React, { useState, useMemo } from 'react';
import { Plus, Check, Clock, X, ChevronRight, Flag, Repeat, Bell, Play, Square, ListTodo, CalendarDays, RotateCcw, GripVertical, Camera, MessageSquare, Trash2, Image as ImageIcon } from 'lucide-react';

const CONTEXTS = [
  { id: 'all', label: 'All', color: '#8B93A3' },
  { id: 'ZT', label: 'ZT', color: '#5B8DEF' },
  { id: 'DA', label: 'DA', color: '#4FB6A9' },
  { id: 'Cairn', label: 'Cairn', color: '#E8A33D' },
  { id: 'Zalando', label: 'Zalando', color: '#D9668B' },
  { id: 'Home', label: 'Home', color: '#9B7EDE' },
];

const PRIORITIES = [
  { id: 'high', label: 'High', color: '#D9668B' },
  { id: 'medium', label: 'Medium', color: '#E8A33D' },
  { id: 'low', label: 'Low', color: '#4FB6A9' },
];

const RECURRENCE_OPTIONS = [
  { id: null, label: 'Без повтору' },
  { id: 'daily', label: 'Щодня' },
  { id: 'weekly', label: 'Щотижня' },
  { id: 'monthly', label: 'Щомісяця' },
];

const INITIAL_TASKS = [
  {
    id: 1, title: 'Color drawer: octopus flag rollout', context: 'Zalando', priority: 'high',
    due: '14 лип', remind: '9:00', status: 'active', recurring: null,
    comments: [
      { id: 'c1', text: 'Дочекатись апруву від analytics team перед merge', at: '11 лип' },
    ],
    photos: 1,
  },
  {
    id: 2, title: 'Іпотека — липень', context: 'Home', priority: 'high',
    due: '15 лип', remind: '10:00', status: 'active', recurring: 'monthly', next: '1 сер',
    comments: [], photos: 0,
  },
  {
    id: 3, title: 'VAT-7 — липень', context: 'Home', priority: 'high',
    due: '20 лип', remind: '9:00', status: 'active', recurring: 'monthly', next: '20 сер',
    comments: [], photos: 0,
  },
  {
    id: 4, title: 'July invoice — Zoolatech', context: 'ZT', priority: 'medium',
    due: '17 лип', remind: null, status: 'active', recurring: 'monthly', next: '15 сер',
    comments: [], photos: 0,
  },
  {
    id: 5, title: 'Показники води', context: 'Home', priority: 'low',
    due: '23 лип', remind: '18:00', status: 'active', recurring: 'monthly', next: '23 сер',
    comments: [{ id: 'c2', text: 'Лічильник у котельні, фото минулих показників в альбомі', at: '23 чер' }],
    photos: 2,
  },
  {
    id: 6, title: 'Cairn: /decide command polish', context: 'Cairn', priority: 'low',
    due: null, remind: null, status: 'active', recurring: null, comments: [], photos: 0,
  },
];

function ctxOf(id) { return CONTEXTS.find(c => c.id === id) || CONTEXTS[0]; }
function prOf(id) { return PRIORITIES.find(p => p.id === id); }

/* ---------- Small pill button ---------- */
function Pill({ active, color, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all shrink-0"
      style={{
        background: active ? (color || '#2A303C') : '#1C222C',
        color: active ? (color ? '#0B0E13' : '#EDEFF3') : '#8B93A3',
        border: `1px solid ${active ? (color || '#3A4150') : '#262D39'}`,
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Task detail sheet ---------- */
function TaskDetailSheet({ task, onClose, onUpdate, onDelete }) {
  const [draft, setDraft] = useState(task);
  const [newComment, setNewComment] = useState('');

  const save = (patch) => {
    const updated = { ...draft, ...patch };
    setDraft(updated);
    onUpdate(updated);
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    save({ comments: [...draft.comments, { id: `c${Date.now()}`, text: newComment.trim(), at: 'зараз' }] });
    setNewComment('');
  };

  const ctx = ctxOf(draft.context);

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-30" style={{ background: 'rgba(5,6,10,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />

      {/* Sheet */}
      <div
        className="absolute left-0 right-0 bottom-0 z-40 rounded-t-[1.5rem] flex flex-col"
        style={{ background: '#171C24', maxHeight: '88%', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: '#3A4150' }} />
        </div>

        <div className="overflow-y-auto px-5 pb-6">
          {/* Title */}
          <input
            value={draft.title}
            onChange={e => save({ title: e.target.value })}
            className="w-full bg-transparent outline-none text-[17px] font-semibold mt-1 mb-4"
            style={{ color: '#EDEFF3' }}
          />

          {/* Context */}
          <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Контекст</p>
          <div className="flex gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {CONTEXTS.filter(c => c.id !== 'all').map(c => (
              <Pill key={c.id} active={draft.context === c.id} color={draft.context === c.id ? c.color : null} onClick={() => save({ context: c.id })}>
                {c.label}
              </Pill>
            ))}
          </div>

          {/* Priority */}
          <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Пріоритет</p>
          <div className="flex gap-2 mb-4">
            {PRIORITIES.map(p => (
              <Pill key={p.id} active={draft.priority === p.id} color={draft.priority === p.id ? p.color : null} onClick={() => save({ priority: p.id })}>
                <span className="flex items-center gap-1.5"><Flag size={11} />{p.label}</span>
              </Pill>
            ))}
          </div>

          {/* Due + Reminder row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Дедлайн</p>
              <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
                <Clock size={13} color="#8B93A3" />
                <span className="text-[13px]" style={{ color: draft.due ? '#EDEFF3' : '#5A6272' }}>{draft.due || 'Додати'}</span>
              </button>
            </div>
            <div>
              <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Нагадування</p>
              <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
                <Bell size={13} color={draft.remind ? '#9B7EDE' : '#8B93A3'} />
                <span className="text-[13px]" style={{ color: draft.remind ? '#EDEFF3' : '#5A6272' }}>{draft.remind || 'Додати'}</span>
              </button>
            </div>
          </div>

          {/* Recurrence */}
          <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Повторення</p>
          <div className="flex gap-2 mb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {RECURRENCE_OPTIONS.map(r => (
              <Pill key={String(r.id)} active={draft.recurring === r.id} onClick={() => save({ recurring: r.id })}>
                <span className="flex items-center gap-1.5">{r.id && <Repeat size={11} />}{r.label}</span>
              </Pill>
            ))}
          </div>
          {draft.recurring && (
            <p className="text-[11px] mb-4 flex items-center gap-1.5" style={{ color: '#5A6272' }}>
              <Repeat size={10} />Наступний інстанс: {draft.next || '1 сер'}
            </p>
          )}
          {!draft.recurring && <div className="mb-4" />}

          {/* Photos */}
          <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Фото</p>
          <div className="flex gap-2 mb-4">
            {Array.from({ length: draft.photos }).map((_, i) => (
              <div key={i} className="w-16 h-16 rounded-xl flex items-center justify-center relative" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
                <ImageIcon size={20} color="#3A4150" />
                <button className="absolute -top-1.5 -right-1.5 rounded-full p-0.5" style={{ background: '#262D39' }}>
                  <X size={10} color="#8B93A3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => save({ photos: draft.photos + 1 })}
              className="w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-1"
              style={{ background: '#1C222C', border: '1px dashed #3A4150' }}
            >
              <Camera size={16} color="#8B93A3" />
              <span className="text-[9px]" style={{ color: '#5A6272' }}>Додати</span>
            </button>
          </div>

          {/* Comments */}
          <p className="text-[10.5px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Коментарі</p>
          {draft.comments.map(c => (
            <div key={c.id} className="rounded-xl px-3 py-2.5 mb-2" style={{ background: '#1C222C' }}>
              <p className="text-[13px] leading-snug" style={{ color: '#B8BFCC' }}>{c.text}</p>
              <p className="text-[10px] font-mono mt-1" style={{ color: '#5A6272' }}>{c.at}</p>
            </div>
          ))}
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
              <MessageSquare size={13} color="#5A6272" />
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()}
                placeholder="Додати коментар..."
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: '#EDEFF3' }}
              />
            </div>
            <button onClick={addComment} className="rounded-xl p-2.5" style={{ background: '#E8A33D' }}>
              <ChevronRight size={15} color="#14181F" strokeWidth={2.5} />
            </button>
          </div>

          {/* Danger zone */}
          <button
            onClick={() => { onDelete(draft.id); onClose(); }}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium"
            style={{ background: 'rgba(217,102,139,0.12)', color: '#D9668B', border: '1px solid rgba(217,102,139,0.25)' }}
          >
            <Trash2 size={14} />Видалити задачу
          </button>

          <p className="text-[10px] text-center mt-3" style={{ color: '#3A4150' }}>
            На вебі цей самий екран відкривається як центрований popup
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------- Task card ---------- */
function TaskCard({ task, onToggle, onStartTimer, timerTaskId, onOpen }) {
  const color = ctxOf(task.context).color;
  const pr = prOf(task.priority);
  const isRunning = timerTaskId === task.id;
  return (
    <div
      className="relative flex items-start gap-2 rounded-xl p-3 mb-2 cursor-pointer"
      style={{ background: isRunning ? '#1E2A26' : '#1C222C', borderLeft: `3px solid ${color}` }}
      onClick={() => onOpen(task)}
    >
      <div className="mt-1 shrink-0" style={{ color: '#3A4150' }}><GripVertical size={14} /></div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
        className="mt-0.5 shrink-0 rounded-full"
        style={{ width: 22, height: 22, border: '1.5px solid #3A4150' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] leading-snug" style={{ color: '#EDEFF3' }}>{task.title}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}1A` }}>{task.context}</span>
          {pr && <span className="flex items-center gap-1 text-[10px]" style={{ color: pr.color }}><Flag size={9} fill={pr.color} strokeWidth={0} />{pr.label}</span>}
          {task.due && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#8B93A3' }}><Clock size={9} />{task.due}</span>}
          {task.remind && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#9B7EDE' }}><Bell size={9} />{task.remind}</span>}
          {task.recurring && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#5A6272' }}><Repeat size={9} />{task.next}</span>}
          {task.comments.length > 0 && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#5A6272' }}><MessageSquare size={9} />{task.comments.length}</span>}
          {task.photos > 0 && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#5A6272' }}><ImageIcon size={9} />{task.photos}</span>}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onStartTimer(task.id); }}
        className="shrink-0 mt-0.5 flex items-center justify-center rounded-full"
        style={{ width: 26, height: 26, background: isRunning ? '#4FB6A9' : '#262D39' }}
      >
        {isRunning ? <Square size={10} color="#14181F" fill="#14181F" /> : <Play size={11} color="#8B93A3" fill="#8B93A3" />}
      </button>
    </div>
  );
}

/* ---------- Root ---------- */
export default function TaskManagerV3() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [activeContext, setActiveContext] = useState('all');
  const [timerTaskId, setTimerTaskId] = useState(null);
  const [openTask, setOpenTask] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const filtered = useMemo(
    () => activeContext === 'all' ? tasks : tasks.filter(t => t.context === activeContext),
    [tasks, activeContext]
  );

  const counts = CONTEXTS.map(c => ({
    ...c,
    count: c.id === 'all' ? tasks.length : tasks.filter(t => t.context === c.id).length,
  }));

  const toggle = (id) => {
    const t = tasks.find(x => x.id === id);
    setTasks(prev => prev.filter(x => x.id !== id));
    setToast(t?.recurring ? `Виконано. Наступний раз: ${t.next}` : 'Виконано ✓');
    setTimeout(() => setToast(null), 2200);
  };

  const updateTask = (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

  const addTask = () => {
    if (!newTitle.trim()) return;
    const t = {
      id: Date.now(), title: newTitle.trim(),
      context: activeContext === 'all' ? 'ZT' : activeContext,
      priority: 'medium', due: null, remind: null, status: 'active',
      recurring: null, comments: [], photos: 0,
    };
    setTasks(prev => [t, ...prev]);
    setNewTitle('');
    setShowAdd(false);
    setOpenTask(t); // одразу відкриваємо деталі для доналаштування
  };

  const timerTask = tasks.find(t => t.id === timerTaskId);

  return (
    <div className="w-full min-h-screen flex items-start justify-center py-6" style={{ background: '#0B0E13', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div className="relative w-full max-w-[390px] rounded-[2rem] overflow-hidden flex flex-col" style={{ background: '#14181F', boxShadow: '0 0 0 8px #05060A, 0 20px 60px rgba(0,0,0,0.5)', height: 780 }}>
        <div className="flex justify-center pt-2 pb-1 shrink-0"><div className="w-24 h-1.5 rounded-full" style={{ background: '#2A303C' }} /></div>

        <div className="px-5 pt-2 pb-3 shrink-0">
          <p className="text-[10.5px] tracking-[0.15em] font-mono uppercase" style={{ color: '#5A6272' }}>Log — Tue, Jul 14</p>
          <h1 className="text-[22px] font-semibold" style={{ color: '#EDEFF3', letterSpacing: '-0.02em' }}>{tasks.length} open tasks</h1>
        </div>

        <div className="flex gap-2 px-5 pb-3 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
          {counts.map(c => {
            const isActive = activeContext === c.id;
            return (
              <button key={c.id} onClick={() => setActiveContext(c.id)} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium"
                style={{ background: isActive ? c.color : '#1C222C', color: isActive ? '#0B0E13' : '#B8BFCC', border: `1px solid ${isActive ? c.color : '#262D39'}` }}>
                {c.label}
                <span className="text-[9.5px] px-1.5 rounded-full font-mono" style={{ background: isActive ? 'rgba(11,14,19,0.25)' : '#262D39', color: isActive ? '#0B0E13' : '#8B93A3' }}>{c.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3 min-h-0">
          {filtered.map(t => (
            <TaskCard key={t.id} task={t} onToggle={toggle} onStartTimer={(id) => setTimerTaskId(p => p === id ? null : id)} timerTaskId={timerTaskId} onOpen={setOpenTask} />
          ))}
        </div>

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-40 px-4 py-2 rounded-full text-[12px] z-20" style={{ background: '#262D39', color: '#EDEFF3', border: '1px solid #3A4150' }}>{toast}</div>
        )}

        {timerTask && (
          <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 shrink-0" style={{ background: '#1E2A26', border: '1px solid #2E4038' }}>
            <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#4FB6A9' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate" style={{ color: '#EDEFF3' }}>{timerTask.title}</p>
              <p className="text-[10px] font-mono" style={{ color: '#4FB6A9' }}>0:12:40</p>
            </div>
            <button onClick={() => setTimerTaskId(null)} className="shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: '#4FB6A9' }}>
              <Square size={10} color="#14181F" fill="#14181F" />
              <span className="text-[11px] font-semibold" style={{ color: '#14181F' }}>Stop</span>
            </button>
          </div>
        )}

        <div className="px-5 pb-5 shrink-0">
          {showAdd ? (
            <div className="flex items-center gap-2 rounded-xl p-2" style={{ background: '#1C222C', border: '1px solid #2A303C' }}>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Нова задача..." className="flex-1 bg-transparent outline-none text-[13.5px] px-2" style={{ color: '#EDEFF3' }} />
              <button onClick={addTask} className="rounded-lg p-2" style={{ background: '#E8A33D' }}><ChevronRight size={15} color="#14181F" strokeWidth={2.5} /></button>
              <button onClick={() => setShowAdd(false)} className="rounded-lg p-2" style={{ background: '#262D39' }}><X size={15} color="#8B93A3" /></button>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-[13.5px]" style={{ background: '#E8A33D', color: '#14181F' }}>
              <Plus size={16} strokeWidth={2.5} />Додати задачу
            </button>
          )}
        </div>

        {openTask && (
          <TaskDetailSheet
            task={tasks.find(t => t.id === openTask.id) || openTask}
            onClose={() => setOpenTask(null)}
            onUpdate={updateTask}
            onDelete={deleteTask}
          />
        )}
      </div>
    </div>
  );
}
