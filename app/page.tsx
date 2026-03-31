"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { logSession, syncDaySummary } from "@/lib/supabase";

// ── Sticker system ──
const STICKERS = {
  hype: [2, 3, 18, 23, 28],
  focus: [4, 14, 17, 19, 20],
  lazy: [1, 9, 13, 16, 29],
  fire: [3, 15, 26, 28, 30],
  celebrate: [2, 8, 18, 22, 25, 28],
};

function randomSticker(category: keyof typeof STICKERS): string {
  const picks = STICKERS[category];
  return `/emoji/sticker_${picks[Math.floor(Math.random() * picks.length)]}.png`;
}

function fireConfetti() {
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } });
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } });
  setTimeout(() => confetti({ ...defaults, particleCount: 30, origin: { x: 0.5, y: 0.4 } }), 250);
}

function fireBigConfetti() {
  const end = Date.now() + 2000;
  const colors = ["#7b93ff", "#5dd97a", "#f5a623"];
  const frame = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors, zIndex: 9999 });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors, zIndex: 9999 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

// ── Types ──
type TaskStatus = "pending" | "active" | "done" | "skipped";

interface TaskTemplate {
  id: string;
  label: string;
  emoji: string;
  duration: number;
  repeatable: boolean;
  isCustom?: boolean;
}

interface Task extends TaskTemplate {
  status: TaskStatus;
  elapsed: number;
  completedCount: number;
}

interface DayRecord {
  date: string;
  tasks: Task[];
  totalMinutes: number;
  completedCount: number;
  totalCount: number;
}

interface TodayData {
  date: string;
  tasks: Task[];
}

// ── Built-in task templates ──
const BUILTIN_TASKS: TaskTemplate[] = [
  { id: "morning-pages", label: "Morning Pages", emoji: "\u270D\uFE0F", duration: 15 * 60, repeatable: true },
  { id: "food", label: "Prepare Food", emoji: "\uD83C\uDF73", duration: 15 * 60, repeatable: false },
  { id: "journal", label: "Write Journal", emoji: "\uD83D\uDCD3", duration: 15 * 60, repeatable: false },
  { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFCB\uFE0F", duration: 15 * 60, repeatable: false },
  { id: "study-1", label: "Study Session 1", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-2", label: "Study Session 2", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-3", label: "Study Session 3", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
];

// ── Custom task localStorage ──
const CUSTOM_TASKS_KEY = "nn-custom-tasks";
const HIDDEN_TASKS_KEY = "nn-hidden-tasks";

function loadCustomTasks(): TaskTemplate[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TASKS_KEY) || "[]"); } catch { return []; }
}
function saveCustomTasks(tasks: TaskTemplate[]) {
  localStorage.setItem(CUSTOM_TASKS_KEY, JSON.stringify(tasks));
}
function loadHiddenTasks(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_TASKS_KEY) || "[]"); } catch { return []; }
}
function saveHiddenTasks(ids: string[]) {
  localStorage.setItem(HIDDEN_TASKS_KEY, JSON.stringify(ids));
}

function buildTemplates(): TaskTemplate[] {
  if (typeof window === "undefined") return BUILTIN_TASKS;
  const hidden = loadHiddenTasks();
  const custom = loadCustomTasks();
  const builtins = BUILTIN_TASKS.filter((t) => !hidden.includes(t.id));
  // Saturday: add Record a Video
  if (new Date().getDay() === 6 && !hidden.includes("record-video")) {
    builtins.push({ id: "record-video", label: "Record a Video", emoji: "\uD83C\uDFA5", duration: 30 * 60, repeatable: false });
  }
  return [...builtins, ...custom.map((t) => ({ ...t, isCustom: true }))];
}

function freshTasks(): Task[] {
  return buildTemplates().map((t) => ({ ...t, status: "pending" as TaskStatus, elapsed: 0, completedCount: 0 }));
}

// ── Motivation ──
const QUOTES = [
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It's not about being the best. It's about being better than you were yesterday.", author: "" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "" },
  { text: "You don't have to be extreme, just consistent.", author: "" },
  { text: "The pain of discipline is nothing like the pain of disappointment.", author: "" },
  { text: "Your future self is watching you right now through memories.", author: "" },
  { text: "One focused hour is worth more than a distracted day.", author: "" },
  { text: "Don't break the chain. Show up every single day.", author: "" },
  { text: "The only bad session is the one that didn't happen.", author: "" },
  { text: "You are one session away from a better mood.", author: "" },
  { text: "Hard choices, easy life. Easy choices, hard life.", author: "" },
];

const SUCCESS_MSGS = [
  "Crushed it! You're building an unstoppable habit.",
  "That's what consistency looks like. Keep going!",
  "One more session done. Future you is grateful.",
  "You showed up. That's what separates the great from the average.",
  "Another brick in the wall of discipline. Solid work!",
  "No excuses, no shortcuts. You did it right.",
  "This is how legends are made — one session at a time.",
  "Your focus muscle just got stronger.",
];

const TIMER_MSGS = [
  "Stay locked in. Distractions are temporary, results are permanent.",
  "This is your time. Own every second of it.",
  "Deep focus mode. The world can wait.",
  "You're in the zone. Don't stop now.",
  "Every second of focus compounds into greatness.",
];

// ── Persistence ──
const TODAY_KEY = "nn-today";
const HISTORY_KEY = "nn-history";

function todayKey(): string { return new Date().toISOString().slice(0, 10); }

function loadToday(): TodayData {
  if (typeof window === "undefined") return { date: todayKey(), tasks: freshTasks() };
  try {
    const saved = localStorage.getItem(TODAY_KEY);
    if (saved) {
      const data: TodayData = JSON.parse(saved);
      if (data.date === todayKey()) {
        // Reconcile: add any new templates not in saved data
        const templates = buildTemplates();
        const existingIds = new Set(data.tasks.map((t) => t.id));
        for (const tmpl of templates) {
          if (!existingIds.has(tmpl.id)) {
            data.tasks.push({ ...tmpl, status: "pending", elapsed: 0, completedCount: 0 });
          }
        }
        // Remove tasks that are no longer in templates
        const templateIds = new Set(templates.map((t) => t.id));
        data.tasks = data.tasks.filter((t) => templateIds.has(t.id));
        return data;
      }
      archiveDay(data);
    }
  } catch {}
  return { date: todayKey(), tasks: freshTasks() };
}

function saveToday(data: TodayData) {
  try { localStorage.setItem(TODAY_KEY, JSON.stringify(data)); } catch {}
}

function archiveDay(data: TodayData) {
  const completed = data.tasks.filter((t) => t.status === "done").length;
  if (completed === 0) return;
  try {
    const history: DayRecord[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!history.some((h) => h.date === data.date)) {
      history.unshift({
        date: data.date, tasks: data.tasks,
        totalMinutes: data.tasks.reduce((s, t) => s + t.completedCount * (t.duration / 60), 0),
        completedCount: completed, totalCount: data.tasks.length,
      });
      if (history.length > 30) history.pop();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch {}
}

function loadHistory(): DayRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

// ── Helpers ──
function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatDateLong(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getStreak(history: DayRecord[]): number {
  if (!history.length) return 0;
  let streak = 0;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  for (let i = 0; i < sorted.length; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const expected = d.toISOString().slice(0, 10);
    if (sorted[i]?.date === expected && sorted[i].completedCount > 0) streak++;
    else if (i === 0 && sorted[0].date === todayKey()) { streak++; continue; }
    else break;
  }
  return streak;
}

// ── Shorthand for CSS var references in className ──
const V = {
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  surfaceHover: "var(--color-surface-hover)",
  surfaceActive: "var(--color-surface-active)",
  surfaceSuccess: "var(--color-surface-success)",
  border: "var(--color-border)",
  borderActive: "var(--color-border-active)",
  borderSuccess: "var(--color-border-success)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  faint: "var(--color-text-faint)",
  inverse: "var(--color-text-inverse)",
  accent: "var(--color-accent)",
  accentHover: "var(--color-accent-hover)",
  accentSoft: "var(--color-accent-soft)",
  success: "var(--color-success)",
  successHover: "var(--color-success-hover)",
  warning: "var(--color-warning)",
  warningBg: "var(--color-warning-bg)",
  warningBorder: "var(--color-warning-border)",
  ringTrack: "var(--color-ring-track)",
} as const;

// ── Timer Ring ──
function TimerRing({ progress, size = 220, stroke = 8, overtime = false }: { progress: number; size?: number; stroke?: number; overtime?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - progress);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <defs>
        <linearGradient id="gt" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={V.accent} />
          <stop offset="50%" stopColor="var(--color-accent-gradient-mid)" />
          <stop offset="100%" stopColor="var(--color-accent-gradient-end)" />
        </linearGradient>
        <linearGradient id="go" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={V.success} />
          <stop offset="50%" stopColor="#69db7c" />
          <stop offset="100%" stopColor={V.warning} />
        </linearGradient>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={V.ringTrack} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={overtime ? "rgba(93,217,122,0.1)" : V.accentSoft}
        strokeWidth={stroke + 12} strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={`url(#${overtime ? "go" : "gt"})`}
        strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
    </svg>
  );
}

// ── Emoji picker for task editor ──
const EMOJI_OPTIONS = ["\uD83D\uDCDA", "\u270D\uFE0F", "\uD83C\uDFCB\uFE0F", "\uD83E\uDDD8", "\uD83C\uDFA8", "\uD83C\uDFB5", "\uD83D\uDCBB", "\uD83E\uDDE0", "\uD83C\uDFA5", "\uD83C\uDF73", "\uD83D\uDCD3", "\u2615"];
const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

type View = "splash" | "list" | "timer" | "success" | "allDone" | "history";

export default function Home() {
  const [dayData, setDayData] = useState<TodayData>({ date: todayKey(), tasks: freshTasks() });
  const [view, setView] = useState<View>("splash");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tasks = dayData.tasks;

  const updateTasks = useCallback((updater: (t: Task[]) => Task[]) => {
    setDayData((prev) => ({ ...prev, tasks: updater(prev.tasks) }));
  }, []);

  // ── Mount + theme ──
  useEffect(() => {
    setDayData(loadToday());
    setHistory(loadHistory());
    setMounted(true);

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    if (window.matchMedia("(display-mode: standalone)").matches) setShowInstalled(true);

    // Time-based theme
    const applyTheme = () => {
      const h = new Date().getHours();
      const isLight = h >= 6 && h < 18;
      document.documentElement.classList.toggle("light", isLight);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#faf8f5" : "#0f0f12");
    };
    applyTheme();
    const themeInterval = setInterval(applyTheme, 60000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearInterval(themeInterval);
    };
  }, []);

  // ── Save ──
  useEffect(() => {
    if (!mounted) return;
    saveToday(dayData);
    if (dayData.tasks.some((t) => t.status === "done")) {
      syncDaySummary(dayData.date, dayData.tasks.map((t) => ({
        id: t.id, label: t.label, status: t.status, completedCount: t.completedCount, duration: t.duration,
      })));
    }
  }, [dayData, mounted]);

  // ── Timer tick ──
  useEffect(() => {
    if (running && activeIdx >= 0) {
      intervalRef.current = setInterval(() => {
        updateTasks((prev) => {
          const next = [...prev];
          const task = { ...next[activeIdx] };
          task.elapsed += 1;
          if (task.elapsed >= task.duration && !overtime) setOvertime(true);
          next[activeIdx] = task;
          return next;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, activeIdx, updateTasks, overtime]);

  // ── Actions ──
  const startTask = useCallback((idx: number) => {
    updateTasks((p) => { const n = [...p]; n[idx] = { ...n[idx], status: "active", elapsed: 0 }; return n; });
    setActiveIdx(idx); setRunning(true); setOvertime(false); setView("timer");
  }, [updateTasks]);

  const repeatTask = useCallback((idx: number) => {
    updateTasks((p) => { const n = [...p]; n[idx] = { ...n[idx], status: "pending", elapsed: 0 }; return n; });
  }, [updateTasks]);

  const untickTask = useCallback((idx: number) => {
    updateTasks((p) => {
      const n = [...p]; const t = { ...n[idx] };
      t.status = "pending"; t.elapsed = 0; t.completedCount = Math.max(0, t.completedCount - 1);
      n[idx] = t; return n;
    });
  }, [updateTasks]);

  const skipTask = useCallback(() => {
    updateTasks((p) => { const n = [...p]; n[activeIdx] = { ...n[activeIdx], status: "skipped" }; return n; });
    setRunning(false); setOvertime(false); setView("list");
  }, [activeIdx, updateTasks]);

  const finishTask = useCallback(() => {
    const task = tasks[activeIdx];
    logSession({
      task_id: task.id, task_label: task.label, duration_planned: task.duration,
      duration_actual: task.elapsed, completed_at: new Date().toISOString(),
      date: dayData.date, was_overtime: task.elapsed > task.duration,
    });
    updateTasks((p) => {
      const n = [...p]; const t = { ...n[activeIdx] };
      t.status = "done"; t.completedCount += 1; n[activeIdx] = t; return n;
    });
    setRunning(false); setOvertime(false); setView("success");
  }, [activeIdx, tasks, dayData.date, updateTasks]);

  const continueAfterSuccess = useCallback(() => {
    setView(tasks.some((t) => t.status === "pending") ? "list" : "allDone");
  }, [tasks]);

  const resetAll = useCallback(() => {
    setDayData({ date: todayKey(), tasks: freshTasks() });
    setView("list"); setActiveIdx(-1); setRunning(false); setOvertime(false);
  }, []);

  // ── Task CRUD ──
  const addCustomTask = useCallback((tmpl: TaskTemplate) => {
    const custom = loadCustomTasks();
    custom.push(tmpl);
    saveCustomTasks(custom);
    updateTasks((p) => [...p, { ...tmpl, status: "pending" as TaskStatus, elapsed: 0, completedCount: 0 }]);
    setShowAddForm(false);
  }, [updateTasks]);

  const deleteTask = useCallback((taskId: string) => {
    const isBuiltin = BUILTIN_TASKS.some((t) => t.id === taskId) || taskId === "record-video";
    if (isBuiltin) {
      const hidden = loadHiddenTasks();
      hidden.push(taskId);
      saveHiddenTasks(hidden);
    } else {
      const custom = loadCustomTasks().filter((t) => t.id !== taskId);
      saveCustomTasks(custom);
    }
    updateTasks((p) => p.filter((t) => t.id !== taskId));
  }, [updateTasks]);

  const updateTask = useCallback((taskId: string, updates: Partial<TaskTemplate>) => {
    const isBuiltin = BUILTIN_TASKS.some((t) => t.id === taskId) || taskId === "record-video";
    if (!isBuiltin) {
      const custom = loadCustomTasks().map((t) => t.id === taskId ? { ...t, ...updates } : t);
      saveCustomTasks(custom);
    }
    updateTasks((p) => p.map((t) => t.id === taskId ? { ...t, ...updates } : t));
    setEditingId(null);
  }, [updateTasks]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    const p = installPrompt as BeforeInstallPromptEvent;
    p.prompt();
    const r = await p.userChoice;
    if (r.outcome === "accepted") setShowInstalled(true);
    setInstallPrompt(null);
  };

  if (!mounted) return (
    <div className="flex items-center justify-center min-h-screen">
      <div style={{ color: V.muted }}>Loading...</div>
    </div>
  );

  // ── SPLASH ──
  if (view === "splash") return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 cursor-pointer" onClick={() => setView("list")}>
      <img src="/gonchu.webp" alt="Ghochu" className="w-44 h-44 object-contain mb-4 animate-pop-in animate-float" />
      <img src={randomSticker("hype")} alt="" className="w-14 h-14 mb-4 animate-sticker-drop" style={{ animationDelay: "0.3s" }} />
      <h1 className="text-3xl font-bold mb-2 animate-fade-up" style={{ animationDelay: "0.4s" }}>Hey Gonchuuu</h1>
      <p className="text-sm mb-8 animate-fade-up" style={{ color: V.muted, animationDelay: "0.6s" }}>Ready to crush your non-negotiables?</p>
      <p className="text-xs animate-pulse animate-fade-up" style={{ color: V.faint, animationDelay: "0.8s" }}>tap anywhere to start</p>
    </div>
  );

  const activeTask = activeIdx >= 0 ? tasks[activeIdx] : null;
  const remaining = activeTask ? activeTask.duration - activeTask.elapsed : 0;
  const progress = activeTask ? activeTask.elapsed / activeTask.duration : 0;
  const completedCount = tasks.filter((t) => t.status === "done").length;
  const totalMinutes = tasks.reduce((s, t) => s + t.completedCount * (t.duration / 60), 0);
  const streak = getStreak(history);
  const motivation = QUOTES[Math.floor(Date.now() / 3600000) % QUOTES.length];

  // ── HISTORY ──
  if (view === "history") {
    // Build contribution grid: 5 weeks x 7 days
    const gridWeeks = 5;
    const today = new Date();
    const todayStr = todayKey();
    const historyMap = new Map(history.map((d) => [d.date, d]));
    // Also check if today has completions from current session
    const todayCompleted = completedCount;

    const grid: { date: string; level: number; label: string }[][] = [];
    // Start from (gridWeeks * 7 - 1) days ago, aligned to Monday
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (gridWeeks * 7 - 1));
    // Align to Monday (1 = Monday)
    const startDay = startDate.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    startDate.setDate(startDate.getDate() + mondayOffset);

    let currentDate = new Date(startDate);
    for (let w = 0; w < gridWeeks; w++) {
      const week: { date: string; level: number; label: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = currentDate.toISOString().slice(0, 10);
        const record = historyMap.get(dateStr);
        const isFuture = currentDate > today;
        let level = 0;
        let completions = 0;
        let total = 1;

        if (dateStr === todayStr) {
          completions = todayCompleted;
          total = tasks.length || 1;
        } else if (record) {
          completions = record.completedCount;
          total = record.totalCount || 1;
        }

        if (!isFuture && (completions > 0 || record)) {
          const ratio = completions / total;
          if (ratio === 0) level = 0;
          else if (ratio < 0.33) level = 1;
          else if (ratio < 0.66) level = 2;
          else if (ratio < 1) level = 3;
          else level = 4;
        }
        if (isFuture) level = -1;

        const dayName = currentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        week.push({ date: dateStr, level, label: `${dayName}: ${completions}/${total} sessions` });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      grid.push(week);
    }

    const totalMins = history.reduce((s, d) => s + d.totalMinutes, 0) + totalMinutes;
    const totalDaysActive = history.filter((d) => d.completedCount > 0).length + (todayCompleted > 0 ? 1 : 0);
    const avgCompletion = history.length > 0
      ? Math.round(history.reduce((s, d) => s + (d.completedCount / d.totalCount) * 100, 0) / history.length)
      : 0;

    // Find longest streak
    let longestStreak = streak;
    if (history.length > 1) {
      const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].date + "T00:00:00");
        const curr = new Date(sorted[i].date + "T00:00:00");
        const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
        if (diffDays === 1 && sorted[i].completedCount > 0) {
          run++;
          if (run > longestStreak) longestStreak = run;
        } else {
          run = sorted[i].completedCount > 0 ? 1 : 0;
        }
      }
    }

    const gridColors = [
      V.surface,           // 0: no activity
      "var(--color-grid-1, #1a3520)", // 1: low
      "var(--color-grid-2, #264d33)", // 2: medium
      "var(--color-grid-3, #2ea84d)", // 3: high
      V.success,           // 4: full
    ];

    return (
      <div className="max-w-md mx-auto px-4 py-8 min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setView("list")} className="text-sm font-medium" style={{ color: V.accent }}>&larr; Back</button>
          <h1 className="text-lg font-bold">Daily Progress</h1>
          <div className="w-12" />
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 rounded-xl text-center" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
            <div className="text-2xl font-bold" style={{ color: V.accent }}>{streak}</div>
            <div className="text-xs" style={{ color: V.muted }}>Current Streak</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
            <div className="text-2xl font-bold" style={{ color: V.success }}>{longestStreak}</div>
            <div className="text-xs" style={{ color: V.muted }}>Longest Streak</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
            <div className="text-2xl font-bold">{Math.round(totalMins)}<span className="text-sm font-normal" style={{ color: V.muted }}>m</span></div>
            <div className="text-xs" style={{ color: V.muted }}>Total Focused</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
            <div className="text-2xl font-bold">{avgCompletion}<span className="text-sm font-normal" style={{ color: V.muted }}>%</span></div>
            <div className="text-xs" style={{ color: V.muted }}>Avg Completion</div>
          </div>
        </div>

        {/* GitHub-style contribution grid */}
        <div className="p-4 rounded-xl mb-6" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{totalDaysActive} active days</span>
            <div className="flex items-center gap-1 text-xs" style={{ color: V.muted }}>
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <div key={l} className="w-2.5 h-2.5 rounded-sm" style={{ background: gridColors[l] }} />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* Day labels */}
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 mr-1" style={{ color: V.faint, fontSize: "9px", lineHeight: "14px" }}>
              <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
            </div>
            {/* Grid columns (weeks) */}
            <div className="flex gap-1 flex-1">
              {grid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1 flex-1">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      className="aspect-square rounded-sm transition-all"
                      style={{
                        background: day.level === -1 ? "transparent" : gridColors[Math.max(0, day.level)],
                        border: day.date === todayStr ? `1.5px solid ${V.accent}` : day.level === 0 ? `1px solid ${V.border}` : "none",
                        opacity: day.level === -1 ? 0.15 : 1,
                      }}
                      title={day.label}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent days list */}
        {history.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium" style={{ color: V.muted }}>Recent Sessions</h2>
            {history.slice(0, 7).map((day) => (
              <div key={day.date} className="p-3 rounded-xl" style={{ background: V.surface, border: `1px solid ${V.border}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-sm">{formatDate(day.date)}</span>
                  <span className="text-sm" style={{ color: V.success }}>{day.completedCount}/{day.totalCount}</span>
                </div>
                <div className="w-full h-1 rounded-full overflow-hidden mb-1.5" style={{ background: V.border }}>
                  <div className="h-full rounded-full" style={{ background: V.success, width: `${(day.completedCount / day.totalCount) * 100}%` }} />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {day.tasks.map((t) => (
                    <span key={t.id} className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: t.status === "done" ? V.surfaceSuccess : V.surface, color: t.status === "done" ? V.success : V.faint }}>
                      {t.emoji}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {history.length === 0 && (
          <div className="text-center mt-8" style={{ color: V.muted }}>
            <img src="/emoji/sticker_10.png" alt="" className="w-16 h-16 mx-auto mb-3 opacity-60" />
            <p className="text-sm">Complete your first day to see the grid fill up</p>
          </div>
        )}
      </div>
    );
  }

  // ── LIST ──
  if (view === "list") return (
    <div className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col">
      <div className="text-center mb-6 animate-fade-down">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Non-Negotiables</h1>
          {!running && (
            <button onClick={() => { setEditMode(!editMode); setEditingId(null); setShowAddForm(false); }}
              className="p-1.5 rounded-lg transition-all" style={{ color: editMode ? V.accent : V.muted, background: editMode ? V.accentSoft : "transparent" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: V.muted }}>{formatDateLong(dayData.date)}</p>
        {editMode ? (
          <p className="text-xs mt-1 italic" style={{ color: V.faint }}>Your non-negotiables. No excuses.</p>
        ) : (
          <p className="text-xs mt-0.5" style={{ color: V.muted }}>
            {completedCount}/{tasks.length} completed
            {streak > 0 && <span className="ml-2">&#128293; {streak} day streak</span>}
          </p>
        )}
      </div>

      {!editMode && (
        <div className="text-center mb-6 px-4">
          <p className="text-sm italic" style={{ color: V.faint }}>&ldquo;{motivation.text}&rdquo;</p>
          {motivation.author && <p className="text-xs mt-1" style={{ color: V.faint }}>&mdash; {motivation.author}</p>}
        </div>
      )}

      {!editMode && (
        <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: V.border }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ background: V.accent, width: `${(completedCount / tasks.length) * 100}%` }} />
        </div>
      )}

      <div className="space-y-3 flex-1 stagger-children">
        {tasks.map((task, idx) => (
          <div key={task.id}>
            {editingId === task.id ? (
              <TaskEditForm task={task} onSave={(u) => updateTask(task.id, u)} onCancel={() => setEditingId(null)} />
            ) : (
              <div className={`w-full flex items-center gap-4 p-4 rounded-xl animate-fade-up card-lift ${editMode ? "cursor-pointer" : ""}`}
                style={{
                  background: task.status === "done" ? V.surfaceSuccess : task.status === "active" ? V.surfaceActive : V.surface,
                  border: `1px solid ${task.status === "done" ? V.borderSuccess : task.status === "active" ? V.borderActive : V.border}`,
                  opacity: task.status === "skipped" ? 0.4 : 1,
                }}
                onClick={editMode && !task.isCustom ? undefined : undefined}
              >
                <span className="text-2xl">{task.emoji}</span>
                <div className="flex-1 text-left">
                  <div className="font-medium" style={{ color: task.status === "done" && !task.repeatable ? V.muted : V.text, textDecoration: task.status === "done" && !task.repeatable ? "line-through" : "none" }}>
                    {task.label}
                  </div>
                  <div className="text-sm" style={{ color: V.muted }}>
                    {task.duration / 60} min
                    {task.completedCount > 0 && <span className="ml-2" style={{ color: V.success }}>&#10003; {task.completedCount}x</span>}
                  </div>
                </div>
                {editMode ? (
                  <div className="flex gap-2">
                    {task.isCustom && (
                      <button onClick={() => setEditingId(task.id)} className="p-1 rounded" style={{ color: V.muted }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" /></svg>
                      </button>
                    )}
                    <button onClick={() => deleteTask(task.id)} className="p-1 rounded transition-colors hover:bg-red-500/10" style={{ color: "#ef4444" }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ) : task.status === "done" && task.repeatable ? (
                  <button onClick={() => repeatTask(idx)} className="text-sm font-medium transition-colors" style={{ color: V.accent }}>Again &rarr;</button>
                ) : task.status === "done" ? (
                  <button onClick={() => untickTask(idx)} className="text-lg transition-colors" style={{ color: V.success }} title="Undo">&#10003;</button>
                ) : task.status === "skipped" ? (
                  <span className="text-sm" style={{ color: V.muted }}>skipped</span>
                ) : (
                  <button onClick={() => startTask(idx)} className="text-sm font-medium transition-colors" style={{ color: V.accent }}>Start &#8594;</button>
                )}
              </div>
            )}
          </div>
        ))}

        {editMode && !showAddForm && (
          <button onClick={() => setShowAddForm(true)}
            className="w-full p-4 rounded-xl border-2 border-dashed text-sm font-medium transition-all animate-fade-up"
            style={{ borderColor: V.border, color: V.muted }}>
            + Add Session
          </button>
        )}

        {showAddForm && <TaskAddForm onAdd={addCustomTask} onCancel={() => setShowAddForm(false)} />}
      </div>

      {!editMode && (
        <div className="mt-6 space-y-3 pt-4" style={{ borderTop: `1px solid ${V.border}` }}>
          <button onClick={() => setView("history")} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all"
            style={{ border: `1px solid ${V.border}`, color: V.muted }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60"><path d="M8 4v4l3 2M14 8a6 6 0 11-12 0 6 6 0 0112 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            Daily Progress
          </button>
          {completedCount > 0 && (
            <button onClick={resetAll} className="w-full text-sm py-2 transition-colors" style={{ color: V.muted }}>Reset all sessions</button>
          )}
          {installPrompt && !showInstalled && (
            <button onClick={handleInstall} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all"
              style={{ border: `1px solid ${V.border}`, color: V.muted }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60"><path d="M8 1v9m0 0L5 7m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Install App
            </button>
          )}
          {showInstalled && <p className="text-center text-xs" style={{ color: V.muted }}>&#10003; App installed</p>}
        </div>
      )}
    </div>
  );

  // ── TIMER ──
  if (view === "timer" && activeTask) {
    const timerMsg = TIMER_MSGS[activeIdx % TIMER_MSGS.length];
    const timeStr = overtime
      ? "+" + formatTime(activeTask.elapsed - activeTask.duration)
      : formatTime(remaining);

    return (
      <div className="max-w-md mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
        {/* DND — compact top bar */}
        <div className="mb-3 px-3 py-1.5 rounded-full text-center animate-fade-down"
          style={{ background: V.warningBg, border: `1px solid ${V.warningBorder}` }}>
          <p className="text-[10px] font-medium" style={{ color: V.warning }}>&#128244; DND for zero distractions</p>
        </div>

        {/* Task info — compact */}
        <div className="flex items-center gap-2 mb-6 animate-fade-up">
          <span className="text-2xl">{activeTask.emoji}</span>
          <div>
            <h2 className="text-base font-semibold leading-tight">{activeTask.label}</h2>
            <p className="text-xs" style={{ color: V.muted }}>{activeIdx + 1} of {tasks.length}</p>
          </div>
          <img src={overtime ? randomSticker("fire") : running ? randomSticker("focus") : randomSticker("lazy")}
            alt="" className={`w-8 h-8 ml-1 ${overtime ? "animate-wiggle" : ""}`} key={`${running}-${overtime}`} />
        </div>

        {/* Timer ring — centered and breathing */}
        <div className={`relative mb-8 ring-breathe ${overtime ? "timer-glow-overtime" : "timer-glow"}`}>
          <TimerRing progress={overtime ? 1 : progress} size={240} stroke={10} overtime={overtime} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {overtime && (
              <span className="text-[10px] font-bold tracking-widest mb-1 uppercase" style={{ color: V.success }}>Overtime</span>
            )}
            {/* Rolling digits */}
            <div className="overflow-hidden" style={{ height: "3rem" }}>
              <div className="font-mono font-bold tracking-wider digit-roll" key={timeStr}
                style={{ fontSize: "2.75rem", lineHeight: "3rem", color: overtime ? V.success : V.text }}>
                {timeStr}
              </div>
            </div>
            <span className="text-xs mt-1.5" style={{ color: V.muted }}>
              {overtime ? "keep going or finish" : running ? "focusing" : "paused"}
            </span>
          </div>
        </div>

        {overtime && (
          <p className="text-sm font-medium mb-5 animate-fade-up" style={{ color: V.success }}>
            You&apos;re in the zone — finish when ready
          </p>
        )}

        {/* Buttons — smart weight hierarchy */}
        {overtime ? (
          /* Overtime: Finish is the hero, Pause is secondary */
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <button onClick={finishTask}
              className="btn-press w-full py-3.5 rounded-xl font-semibold text-base transition-all"
              style={{ background: V.success, color: V.inverse }}>
              Finish Session
            </button>
            <button onClick={() => setRunning((r) => !r)}
              className="btn-press py-2 text-sm transition-all"
              style={{ color: V.muted }}>
              {running ? "Pause" : "Resume"}
            </button>
          </div>
        ) : (
          /* Normal: Pause/Resume is the hero, Skip & Done are secondary */
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <button onClick={() => setRunning((r) => !r)}
              className="btn-press w-full py-3.5 rounded-xl font-semibold text-base transition-all"
              style={{ background: running ? V.accent : V.accent, color: V.inverse }}>
              {running ? "Pause" : "Resume"}
            </button>
            <div className="flex gap-6">
              <button onClick={skipTask} className="btn-press py-2 text-sm transition-all" style={{ color: V.faint }}>
                Skip
              </button>
              <button onClick={finishTask} className="btn-press py-2 text-sm font-medium transition-all" style={{ color: V.success }}>
                Mark Done
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs italic text-center max-w-xs" style={{ color: V.faint }}>{timerMsg}</p>
      </div>
    );
  }

  // ── SUCCESS ──
  if (view === "success" && activeTask) {
    fireConfetti();
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <img src={randomSticker("celebrate")} alt="" className="w-20 h-20 mb-2 animate-pop-in" />
        <h2 className="text-2xl font-bold mb-2 animate-fade-up" style={{ animationDelay: "0.2s" }}>Nice work, Gonchuuu!</h2>
        <p className="text-sm mb-3 italic max-w-xs animate-fade-up" style={{ color: V.accent, animationDelay: "0.3s" }}>{SUCCESS_MSGS[Math.floor(Math.random() * SUCCESS_MSGS.length)]}</p>
        <p className="mb-1 animate-fade-up" style={{ color: V.muted, animationDelay: "0.4s" }}>
          You completed <span className="font-medium" style={{ color: V.text }}>{activeTask.label}</span>
        </p>
        {activeTask.completedCount > 1 && <p className="text-sm mb-1 animate-fade-up" style={{ color: V.accent }}>{activeTask.completedCount} times today</p>}
        <p className="text-sm mb-8 animate-fade-up" style={{ color: V.muted, animationDelay: "0.5s" }}>{completedCount} of {tasks.length} sessions done</p>
        <div className="flex gap-2 mb-8 animate-fade-up" style={{ animationDelay: "0.6s" }}>
          {tasks.map((t) => (
            <div key={t.id} className="w-3 h-3 rounded-full transition-all"
              style={{ background: t.status === "done" ? V.success : t.status === "skipped" ? V.border : V.ringTrack }} />
          ))}
        </div>
        <button onClick={continueAfterSuccess} className="btn-press px-8 py-3 rounded-lg font-medium transition-all animate-fade-up animate-shimmer"
          style={{ background: V.accent, color: V.inverse, animationDelay: "0.7s" }}>
          {tasks.every((t) => t.status === "done" || t.status === "skipped") ? "See Summary" : "Next Session \u2192"}
        </button>
      </div>
    );
  }

  // ── ALL DONE ──
  if (view === "allDone") {
    fireBigConfetti();
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <img src={randomSticker("fire")} alt="" className="w-16 h-16 mb-2 animate-pop-in" />
        <img src="/gonchu.webp" alt="Ghochu" className="w-28 h-28 object-contain mb-2 animate-float" />
        <h2 className="text-2xl font-bold mb-2">All Done, Gonchuuu!</h2>
        <p className="mb-6" style={{ color: V.muted }}>
          You focused for <span className="font-medium" style={{ color: V.text }}>{Math.round(totalMinutes)} minutes</span> today
        </p>
        <div className="w-full space-y-2 mb-8">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: V.surface, border: `1px solid ${V.border}` }}>
              <span className="text-lg">{task.emoji}</span>
              <span className="flex-1 text-left text-sm">{task.label}</span>
              <span className="text-sm" style={{ color: task.status === "done" ? V.success : V.muted }}>
                {task.status === "done" ? `\u2713 ${task.completedCount > 1 ? `${task.completedCount}x` : `${task.duration / 60}m`}` : "skipped"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView("history")} className="btn-press px-6 py-3 rounded-lg font-medium transition-all"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.text }}>View Progress</button>
          <button onClick={resetAll} className="btn-press px-6 py-3 rounded-lg font-medium transition-all"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.muted }}>Start Fresh</button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Task Add Form ──
function TaskAddForm({ onAdd, onCancel }: { onAdd: (t: TaskTemplate) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("\uD83D\uDCDA");
  const [duration, setDuration] = useState(15);
  const [repeatable, setRepeatable] = useState(false);

  return (
    <div className="p-4 rounded-xl animate-fade-up" style={{ background: V.surface, border: `1px solid ${V.borderActive}` }}>
      <p className="text-xs font-medium mb-3" style={{ color: V.accent }}>New Session</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Session name" maxLength={30}
        className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none focus:ring-2"
        style={{ background: V.surfaceHover, border: `1px solid ${V.border}`, color: V.text, "--tw-ring-color": V.accent } as React.CSSProperties} />
      <div className="flex gap-1.5 flex-wrap mb-3">
        {EMOJI_OPTIONS.map((e) => (
          <button key={e} onClick={() => setEmoji(e)}
            className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
            style={{ background: emoji === e ? V.accentSoft : V.surfaceHover, border: `1px solid ${emoji === e ? V.borderActive : "transparent"}` }}>
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {DURATION_OPTIONS.map((d) => (
          <button key={d} onClick={() => setDuration(d)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: duration === d ? V.accentSoft : V.surfaceHover, color: duration === d ? V.accent : V.muted,
              border: `1px solid ${duration === d ? V.borderActive : "transparent"}` }}>
            {d}m
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)}
          className="w-4 h-4 rounded" style={{ accentColor: V.accent }} />
        <span className="text-sm" style={{ color: V.muted }}>Can repeat?</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-press flex-1 py-2 rounded-lg text-sm" style={{ border: `1px solid ${V.border}`, color: V.muted }}>Cancel</button>
        <button onClick={() => {
          if (!label.trim()) return;
          onAdd({ id: `custom-${Date.now()}`, label: label.trim(), emoji, duration: duration * 60, repeatable, isCustom: true });
        }} disabled={!label.trim()} className="btn-press flex-1 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: label.trim() ? V.accent : V.surfaceHover, color: label.trim() ? V.inverse : V.faint }}>
          Add
        </button>
      </div>
    </div>
  );
}

// ── Task Edit Form (inline) ──
function TaskEditForm({ task, onSave, onCancel }: { task: Task; onSave: (u: Partial<TaskTemplate>) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(task.label);
  const [emoji, setEmoji] = useState(task.emoji);
  const [duration, setDuration] = useState(task.duration / 60);
  const [repeatable, setRepeatable] = useState(task.repeatable);

  return (
    <div className="p-4 rounded-xl animate-fade-up" style={{ background: V.surface, border: `1px solid ${V.borderActive}` }}>
      <p className="text-xs font-medium mb-3" style={{ color: V.accent }}>Edit Session</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30}
        className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none"
        style={{ background: V.surfaceHover, border: `1px solid ${V.border}`, color: V.text }} />
      <div className="flex gap-1.5 flex-wrap mb-3">
        {EMOJI_OPTIONS.map((e) => (
          <button key={e} onClick={() => setEmoji(e)}
            className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
            style={{ background: emoji === e ? V.accentSoft : V.surfaceHover, border: `1px solid ${emoji === e ? V.borderActive : "transparent"}` }}>
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {DURATION_OPTIONS.map((d) => (
          <button key={d} onClick={() => setDuration(d)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: duration === d ? V.accentSoft : V.surfaceHover, color: duration === d ? V.accent : V.muted,
              border: `1px solid ${duration === d ? V.borderActive : "transparent"}` }}>
            {d}m
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)}
          className="w-4 h-4 rounded" style={{ accentColor: V.accent }} />
        <span className="text-sm" style={{ color: V.muted }}>Can repeat?</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-press flex-1 py-2 rounded-lg text-sm" style={{ border: `1px solid ${V.border}`, color: V.muted }}>Cancel</button>
        <button onClick={() => onSave({ label: label.trim(), emoji, duration: duration * 60, repeatable })}
          className="btn-press flex-1 py-2 rounded-lg text-sm font-medium"
          style={{ background: V.accent, color: V.inverse }}>Save</button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
