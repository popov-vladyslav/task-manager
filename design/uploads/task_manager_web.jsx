import React, { useState, useMemo } from 'react';
import { Plus, Check, Clock, X, ChevronRight, ChevronLeft, Flag, Repeat, Bell, Play, Square, ListTodo, CalendarDays, RotateCcw, MessageSquare, Image as ImageIcon, Camera, Trash2, Search } from 'lucide-react';

const CONTEXTS = [
  { id: 'all', label: 'All', color: '#8B93A3' },
  { id: 'ZT', label: 'Zoolatech', color: '#5B8DEF' },
  { id: 'DA', label: 'DataArt', color: '#4FB6A9' },
  { id: 'Cairn', label: 'Cairn', color: '#E8A33D' },
  { id: 'Zalando', label: 'Zalando', color: '#D9668B' },
  { id: 'Home', label: 'Home', color: '#9B7EDE' },
];

const PRIORITIES = [
  { id: 'high', label: 'High', color: '#D9668B' },
  { id: 'medium', label: 'Medium', color: '#E8A33D' },
  { id: 'low', label: 'Low', color: '#4FB6A9' },
];

const TASKS = [
  { id: 1, title: 'Color drawer: octopus flag rollout', context: 'Zalando', priority: 'high', due: '14 лип', remind: '9:00', recurring: null, comments: 1, photos: 1 },
  { id: 2, title: 'Іпотека — липень', context: 'Home', priority: 'high', due: '15 лип', remind: '10:00', recurring: 'monthly', next: '1 сер', comments: 0, photos: 0 },
  { id: 3, title: 'VAT-7 — липень', context: 'Home', priority: 'high', due: '20 лип', remind: '9:00', recurring: 'monthly', next: '20 сер', comments: 0, photos: 0 },
  { id: 4, title: 'July invoice — Zoolatech', context: 'ZT', priority: 'medium', due: '17 лип', remind: null, recurring: 'monthly', next: '15 сер', comments: 0, photos: 0 },
  { id: 5, title: 'July invoice — DataArt', context: 'DA', priority: 'medium', due: '17 лип', remind: null, recurring: 'monthly', next: '15 сер', comments: 0, photos: 0 },
  { id: 6, title: 'Показники води', context: 'Home', priority: 'low', due: '23 лип', remind: '18:00', recurring: 'monthly', next: '23 сер', comments: 1, photos: 2 },
  { id: 7, title: 'Cairn: /decide command polish', context: 'Cairn', priority: 'low', due: null, remind: null, recurring: null, comments: 0, photos: 0 },
  { id: 8, title: 'PDP color title copy review', context: 'Zalando', priority: 'medium', due: '16 лип', remind: null, recurring: null, comments: 0, photos: 0 },
];

const CAL_EVENTS = [
  { id: 'e1', title: 'Color drawer rollout', context: 'Zalando', day: 0, start: 10, dur: 2 },
  { id: 'e2', title: 'Invoice ZT', context: 'ZT', day: 0, start: 14, dur: 1 },
  { id: 'e3', title: 'Іпотека', context: 'Home', day: 1, start: 10, dur: 0.5 },
  { id: 'e4', title: 'PDP copy review', context: 'Zalando', day: 2, start: 11, dur: 1 },
  { id: 'e5', title: 'Cairn polish', context: 'Cairn', day: 2, start: 20, dur: 1.5 },
  { id: 'e6', title: 'Invoice DA', context: 'DA', day: 3, start: 15, dur: 1 },
  { id: 'e7', title: 'VAT-7', context: 'Home', day: 6, start: 9, dur: 0.5 },
];

const DAYS = ['Пн 14', 'Вт 15', 'Ср 16', 'Чт 17', 'Пт 18', 'Сб 19', 'Нд 20'];

function ctxOf(id) { return CONTEXTS.find(c => c.id === id) || CONTEXTS[0]; }
function prOf(id) { return PRIORITIES.find(p => p.id === id); }

/* ---------- Detail popup (web modal) ---------- */
function TaskModal({ task, onClose }) {
  const ctx = ctxOf(task.context);
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(5,6,10,0.65)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ background: '#171C24', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', border: '1px solid #262D39' }}>
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-[18px] font-semibold flex-1" style={{ color: '#EDEFF3' }}>{task.title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 ml-3" style={{ background: '#262D39' }}><X size={15} color="#8B93A3" /></button>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Контекст</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTEXTS.filter(c => c.id !== 'all').map(c => (
                <span key={c.id} className="px-2.5 py-1 rounded-full text-[11.5px] font-medium" style={{ background: task.context === c.id ? c.color : '#1C222C', color: task.context === c.id ? '#0B0E13' : '#5A6272', border: `1px solid ${task.context === c.id ? c.color : '#262D39'}` }}>{c.label}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Пріоритет</p>
            <div className="flex gap-1.5">
              {PRIORITIES.map(p => (
                <span key={p.id} className="px-2.5 py-1 rounded-full text-[11.5px] font-medium flex items-center gap-1" style={{ background: task.priority === p.id ? p.color : '#1C222C', color: task.priority === p.id ? '#0B0E13' : '#5A6272', border: `1px solid ${task.priority === p.id ? p.color : '#262D39'}` }}><Flag size={10} />{p.label}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Дедлайн</p>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
              <Clock size={13} color="#8B93A3" /><span className="text-[13px]" style={{ color: '#EDEFF3' }}>{task.due || '—'}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Нагадування</p>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
              <Bell size={13} color={task.remind ? '#9B7EDE' : '#8B93A3'} /><span className="text-[13px]" style={{ color: '#EDEFF3' }}>{task.remind || '—'}</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Фото</p>
        <div className="flex gap-2 mb-5">
          {Array.from({ length: task.photos }).map((_, i) => (
            <div key={i} className="w-20 h-20 rounded-xl flex items-center justify-center" style={{ background: '#1C222C', border: '1px solid #262D39' }}><ImageIcon size={22} color="#3A4150" /></div>
          ))}
          <button className="w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1" style={{ background: '#1C222C', border: '1px dashed #3A4150' }}>
            <Camera size={17} color="#8B93A3" /><span className="text-[9.5px]" style={{ color: '#5A6272' }}>Додати</span>
          </button>
        </div>

        <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#5A6272' }}>Коментарі</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#1C222C', border: '1px solid #262D39' }}>
            <MessageSquare size={13} color="#5A6272" />
            <input placeholder="Додати коментар..." className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: '#EDEFF3' }} />
          </div>
          <button className="rounded-xl p-2.5" style={{ background: '#E8A33D' }}><ChevronRight size={15} color="#14181F" strokeWidth={2.5} /></button>
        </div>
      </div>
    </>
  );
}

/* ---------- Root: web layout ---------- */
export default function TaskManagerWeb() {
  const [nav, setNav] = useState('tasks');
  const [activeContext, setActiveContext] = useState('all');
  const [openTask, setOpenTask] = useState(null);
  const [timerTaskId, setTimerTaskId] = useState(1);

  const filtered = activeContext === 'all' ? TASKS : TASKS.filter(t => t.context === activeContext);
  const timerTask = TASKS.find(t => t.id === timerTaskId);
  const hourStart = 8, hourEnd = 22;
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);

  return (
    <div className="w-full min-h-screen flex" style={{ background: '#0B0E13', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col p-4" style={{ background: '#10141B', borderRight: '1px solid #1C222C' }}>
        <div className="px-2 pt-1 pb-5">
          <p className="text-[10px] tracking-[0.18em] font-mono uppercase" style={{ color: '#5A6272' }}>Log</p>
          <p className="text-[15px] font-semibold" style={{ color: '#EDEFF3' }}>Tue, Jul 14</p>
        </div>

        {[
          { id: 'tasks', label: 'Tasks', icon: ListTodo, count: TASKS.length },
          { id: 'routine', label: 'Routine', icon: RotateCcw, count: '2/4' },
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
        ].map(item => {
          const Icon = item.icon;
          const isActive = nav === item.id;
          return (
            <button key={item.id} onClick={() => setNav(item.id)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1 text-left"
              style={{ background: isActive ? '#1C222C' : 'transparent' }}>
              <Icon size={16} color={isActive ? '#E8A33D' : '#5A6272'} />
              <span className="flex-1 text-[13.5px] font-medium" style={{ color: isActive ? '#EDEFF3' : '#8B93A3' }}>{item.label}</span>
              {item.count != null && <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: '#262D39', color: '#8B93A3' }}>{item.count}</span>}
            </button>
          );
        })}

        <div className="mt-5 px-2">
          <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#3A4150' }}>Contexts</p>
          {CONTEXTS.map(c => {
            const isActive = activeContext === c.id;
            const count = c.id === 'all' ? TASKS.length : TASKS.filter(t => t.context === c.id).length;
            return (
              <button key={c.id} onClick={() => { setActiveContext(c.id); setNav('tasks'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 mb-0.5"
                style={{ background: isActive ? '#1C222C' : 'transparent' }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 text-left text-[12.5px]" style={{ color: isActive ? '#EDEFF3' : '#8B93A3' }}>{c.label}</span>
                <span className="text-[10px] font-mono" style={{ color: '#5A6272' }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Timer in sidebar */}
        {timerTask && (
          <div className="rounded-xl p-3" style={{ background: '#1E2A26', border: '1px solid #2E4038' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4FB6A9' }} />
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#4FB6A9' }}>In progress</span>
            </div>
            <p className="text-[12px] font-medium mb-1 leading-snug" style={{ color: '#EDEFF3' }}>{timerTask.title}</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-mono" style={{ color: '#4FB6A9' }}>1:47:12</span>
              <button onClick={() => setTimerTaskId(null)} className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: '#4FB6A9' }}>
                <Square size={9} color="#14181F" fill="#14181F" /><span className="text-[10.5px] font-semibold" style={{ color: '#14181F' }}>Stop</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {nav === 'tasks' && (
          <div className="flex-1 flex flex-col p-6 max-w-3xl">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-[22px] font-semibold" style={{ color: '#EDEFF3', letterSpacing: '-0.02em' }}>
                {activeContext === 'all' ? 'Всі задачі' : ctxOf(activeContext).label}
              </h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 w-56" style={{ background: '#171C24', border: '1px solid #262D39' }}>
                  <Search size={13} color="#5A6272" />
                  <input placeholder="Пошук..." className="flex-1 bg-transparent outline-none text-[12.5px]" style={{ color: '#EDEFF3' }} />
                </div>
                <button className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium" style={{ background: '#E8A33D', color: '#14181F' }}>
                  <Plus size={14} strokeWidth={2.5} />Задача
                </button>
              </div>
            </div>

            {filtered.map(t => {
              const color = ctxOf(t.context).color;
              const pr = prOf(t.priority);
              const isRunning = timerTaskId === t.id;
              return (
                <div key={t.id} onClick={() => setOpenTask(t)} className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2 cursor-pointer transition-colors hover:brightness-110"
                  style={{ background: isRunning ? '#1E2A26' : '#171C24', borderLeft: `3px solid ${color}` }}>
                  <button onClick={e => e.stopPropagation()} className="shrink-0 rounded-full" style={{ width: 20, height: 20, border: '1.5px solid #3A4150' }} />
                  <span className="flex-1 text-[14px]" style={{ color: '#EDEFF3' }}>{t.title}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    {t.comments > 0 && <span className="flex items-center gap-1 text-[10.5px]" style={{ color: '#5A6272' }}><MessageSquare size={10} />{t.comments}</span>}
                    {t.photos > 0 && <span className="flex items-center gap-1 text-[10.5px]" style={{ color: '#5A6272' }}><ImageIcon size={10} />{t.photos}</span>}
                    {t.recurring && <Repeat size={11} color="#5A6272" />}
                    {t.remind && <span className="flex items-center gap-1 text-[10.5px]" style={{ color: '#9B7EDE' }}><Bell size={10} />{t.remind}</span>}
                    {t.due && <span className="flex items-center gap-1 text-[10.5px] font-mono" style={{ color: '#8B93A3' }}><Clock size={10} />{t.due}</span>}
                    {pr && <Flag size={11} fill={pr.color} color={pr.color} strokeWidth={0} />}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}1A` }}>{t.context}</span>
                    <button onClick={e => { e.stopPropagation(); setTimerTaskId(p => p === t.id ? null : t.id); }} className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: isRunning ? '#4FB6A9' : '#262D39' }}>
                      {isRunning ? <Square size={9} color="#14181F" fill="#14181F" /> : <Play size={10} color="#8B93A3" fill="#8B93A3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {nav === 'calendar' && (
          <div className="flex-1 flex flex-col p-6 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-[22px] font-semibold" style={{ color: '#EDEFF3' }}>Тиждень 14–20 лип</h1>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-lg p-0.5" style={{ background: '#171C24' }}>
                  {['День', '3 дні', 'Тиждень', 'Місяць'].map((m, i) => (
                    <button key={m} className="px-3 py-1 rounded-md text-[12px] font-medium" style={{ background: i === 2 ? '#262D39' : 'transparent', color: i === 2 ? '#EDEFF3' : '#5A6272' }}>{m}</button>
                  ))}
                </div>
                <button className="rounded-lg p-1.5" style={{ background: '#171C24' }}><ChevronLeft size={14} color="#8B93A3" /></button>
                <button className="rounded-lg p-1.5" style={{ background: '#171C24' }}><ChevronRight size={14} color="#8B93A3" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl" style={{ background: '#10141B', border: '1px solid #1C222C' }}>
              <div className="flex" style={{ minHeight: hours.length * 48 + 32 }}>
                <div className="shrink-0 w-14 pt-8">
                  {hours.map(h => <div key={h} className="text-[10px] font-mono text-right pr-2" style={{ color: '#3A4150', height: 48 }}>{h}:00</div>)}
                </div>
                {DAYS.map((d, di) => (
                  <div key={d} className="flex-1 relative" style={{ borderLeft: '1px solid #171C24', minWidth: 100 }}>
                    <div className="text-[11px] font-medium text-center py-2 sticky top-0" style={{ color: di === 0 ? '#E8A33D' : '#8B93A3', background: '#10141B', height: 32 }}>{d}</div>
                    {hours.map(h => <div key={h} style={{ height: 48, borderTop: '1px solid #151A22' }} />)}
                    {CAL_EVENTS.filter(e => e.day === di).map(e => {
                      const color = ctxOf(e.context).color;
                      return (
                        <div key={e.id} className="absolute left-1 right-1 rounded-md px-2 py-1 cursor-pointer" style={{ top: 32 + (e.start - hourStart) * 48, height: e.dur * 48 - 3, background: `${color}26`, borderLeft: `2.5px solid ${color}` }}>
                          <p className="text-[10.5px] font-medium leading-tight" style={{ color: '#EDEFF3' }}>{e.title}</p>
                          <p className="text-[9px] font-mono" style={{ color }}>{e.start}:00–{e.start + e.dur}:00</p>
                        </div>
                      );
                    })}
                    {di === 0 && (
                      <div className="absolute left-0 right-0 flex items-center" style={{ top: 32 + (11.5 - hourStart) * 48 }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#D9668B' }} />
                        <div className="flex-1 h-px" style={{ background: '#D9668B' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {nav === 'routine' && (
          <div className="p-6 max-w-xl">
            <h1 className="text-[22px] font-semibold mb-4" style={{ color: '#EDEFF3' }}>Денна рутина</h1>
            {[
              { t: 'Standup notes — Zalando', time: '9:45', done: true },
              { t: 'Inbox zero (робоча пошта)', time: '10:00', done: true },
              { t: 'Прогулянка з собакою', time: '13:00', done: false },
              { t: 'Огляд задач на завтра', time: '18:30', done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2" style={{ background: '#171C24' }}>
                <div className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 20, height: 20, border: `1.5px solid ${item.done ? '#4FB6A9' : '#3A4150'}`, background: item.done ? '#4FB6A9' : 'transparent' }}>
                  {item.done && <Check size={12} color="#14181F" strokeWidth={3} />}
                </div>
                <span className="flex-1 text-[14px]" style={{ color: item.done ? '#5A6272' : '#EDEFF3', textDecoration: item.done ? 'line-through' : 'none' }}>{item.t}</span>
                <span className="text-[11px] font-mono" style={{ color: '#5A6272' }}>{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {openTask && <TaskModal task={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
