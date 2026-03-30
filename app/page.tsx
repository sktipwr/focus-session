"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { logSession, syncDaySummary } from "@/lib/supabase";

type TaskStatus = "pending" | "active" | "done" | "skipped";

interface Task {
  id: string;
  label: string;
  emoji: string;
  duration: number;
  status: TaskStatus;
  elapsed: number;
  repeatable: boolean;
  completedCount: number;
}

interface DayRecord {
  date: string;
  tasks: Task[];
  totalMinutes: number;
  completedCount: number;
  totalCount: number;
}

function getDayOfWeek(): number {
  return new Date().getDay(); // 0=Sun, 6=Sat
}

function buildTasks(): Omit<Task, "status" | "elapsed" | "completedCount">[] {
  const base: Omit<Task, "status" | "elapsed" | "completedCount">[] = [
    { id: "morning-pages", label: "Morning Pages", emoji: "\u270D\uFE0F", duration: 15 * 60, repeatable: true },
    { id: "food", label: "Prepare Food", emoji: "\uD83C\uDF73", duration: 15 * 60, repeatable: false },
    { id: "journal", label: "Write Journal", emoji: "\uD83D\uDCD3", duration: 15 * 60, repeatable: false },
    { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFCB\uFE0F", duration: 15 * 60, repeatable: false },
    { id: "study-1", label: "Study Session 1", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
    { id: "study-2", label: "Study Session 2", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
    { id: "study-3", label: "Study Session 3", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  ];
  // Saturday: add Record a Video task
  if (getDayOfWeek() === 6) {
    base.push({ id: "record-video", label: "Record a Video", emoji: "\uD83C\uDFA5", duration: 30 * 60, repeatable: false });
  }
  return base;
}

const TASK_TEMPLATES = buildTasks();

const MOTIVATIONAL_QUOTES = [
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

function getMotivation(): { text: string; author: string } {
  const idx = Math.floor(Date.now() / 3600000) % MOTIVATIONAL_QUOTES.length;
  return MOTIVATIONAL_QUOTES[idx];
}

const SUCCESS_MESSAGES = [
  "Crushed it! You're building an unstoppable habit.",
  "That's what consistency looks like. Keep going!",
  "One more session done. Future you is grateful.",
  "You showed up. That's what separates the great from the average.",
  "Another brick in the wall of discipline. Solid work!",
  "No excuses, no shortcuts. You did it right.",
  "This is how legends are made — one session at a time.",
  "Your focus muscle just got stronger.",
];

function getSuccessMessage(): string {
  return SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)];
}

const TIMER_MOTIVATIONS = [
  "Stay locked in. Distractions are temporary, results are permanent.",
  "This is your time. Own every second of it.",
  "Deep focus mode. The world can wait.",
  "You're in the zone. Don't stop now.",
  "Every second of focus compounds into greatness.",
];

function freshTasks(): Task[] {
  return TASK_TEMPLATES.map((t) => ({ ...t, status: "pending" as TaskStatus, elapsed: 0, completedCount: 0 }));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const TODAY_KEY = "nn-today";
const HISTORY_KEY = "nn-history";

interface TodayData {
  date: string;
  tasks: Task[];
}

function loadToday(): TodayData {
  if (typeof window === "undefined") return { date: todayKey(), tasks: freshTasks() };
  try {
    const saved = localStorage.getItem(TODAY_KEY);
    if (saved) {
      const data: TodayData = JSON.parse(saved);
      if (data.date === todayKey()) return data;
      // Day changed — archive yesterday and start fresh
      archiveDay(data);
    }
  } catch {}
  return { date: todayKey(), tasks: freshTasks() };
}

function saveToday(data: TodayData) {
  try {
    localStorage.setItem(TODAY_KEY, JSON.stringify(data));
  } catch {}
}

function archiveDay(data: TodayData) {
  const completed = data.tasks.filter((t) => t.status === "done").length;
  if (completed === 0) return; // Don't archive empty days
  const record: DayRecord = {
    date: data.date,
    tasks: data.tasks,
    totalMinutes: data.tasks.reduce((sum, t) => sum + t.completedCount * (t.duration / 60), 0),
    completedCount: completed,
    totalCount: data.tasks.length,
  };
  try {
    const history: DayRecord[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    // Don't duplicate
    if (!history.some((h) => h.date === record.date)) {
      history.unshift(record);
      // Keep last 30 days
      if (history.length > 30) history.pop();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch {}
}

function loadHistory(): DayRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function TimerRing({ progress, size = 220, stroke = 8 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e2538" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#5c7cfa"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-linear"
      />
    </svg>
  );
}

// Streak calculation
function getStreak(history: DayRecord[]): number {
  if (history.length === 0) return 0;
  let streak = 0;
  const today = todayKey();
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));

  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);

    // Allow today to not be completed yet
    if (i === 0 && sorted[0].date !== today && sorted[0].date !== expectedStr) {
      // Check if yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (sorted[0].date !== yesterday.toISOString().slice(0, 10)) break;
    }

    if (sorted[i].date === expectedStr || (i === 0 && sorted[i].date === today)) {
      if (sorted[i].completedCount > 0) streak++;
      else break;
    } else {
      break;
    }
  }
  return streak;
}

type View = "splash" | "list" | "timer" | "success" | "allDone" | "history";

export default function Home() {
  const [dayData, setDayData] = useState<TodayData>({ date: todayKey(), tasks: freshTasks() });
  const [view, setView] = useState<View>("splash");
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tasks = dayData.tasks;

  const updateTasks = useCallback((updater: (tasks: Task[]) => Task[]) => {
    setDayData((prev) => ({ ...prev, tasks: updater(prev.tasks) }));
  }, []);

  useEffect(() => {
    const loaded = loadToday();
    setDayData(loaded);
    setHistory(loadHistory());
    setMounted(true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if (window.matchMedia("(display-mode: standalone)").matches) setShowInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (mounted) {
      saveToday(dayData);
      // Sync daily summary to Supabase when any task is completed
      const hasCompleted = dayData.tasks.some((t) => t.status === "done");
      if (hasCompleted) {
        syncDaySummary(
          dayData.date,
          dayData.tasks.map((t) => ({
            id: t.id,
            label: t.label,
            status: t.status,
            completedCount: t.completedCount,
            duration: t.duration,
          }))
        );
      }
    }
  }, [dayData, mounted]);

  useEffect(() => {
    if (running && activeIdx >= 0) {
      intervalRef.current = setInterval(() => {
        updateTasks((prev) => {
          const next = [...prev];
          const task = { ...next[activeIdx] };
          task.elapsed += 1;
          if (task.elapsed >= task.duration && !overtime) {
            // Enter overtime — don't stop, just flip the flag
            setOvertime(true);
          }
          next[activeIdx] = task;
          return next;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, activeIdx, updateTasks]);

  const startTask = useCallback((idx: number) => {
    updateTasks((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "active", elapsed: 0 };
      return next;
    });
    setActiveIdx(idx);
    setRunning(true);
    setOvertime(false);
    setView("timer");
  }, [updateTasks]);

  const repeatTask = useCallback((idx: number) => {
    updateTasks((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "pending", elapsed: 0 };
      return next;
    });
  }, [updateTasks]);

  const untickTask = useCallback((idx: number) => {
    updateTasks((prev) => {
      const next = [...prev];
      const task = { ...next[idx] };
      task.status = "pending";
      task.elapsed = 0;
      task.completedCount = Math.max(0, task.completedCount - 1);
      next[idx] = task;
      return next;
    });
  }, [updateTasks]);

  const pauseResume = useCallback(() => setRunning((r) => !r), []);

  const skipTask = useCallback(() => {
    updateTasks((prev) => {
      const next = [...prev];
      next[activeIdx] = { ...next[activeIdx], status: "skipped" };
      return next;
    });
    setRunning(false);
    setOvertime(false);
    setView("list");
  }, [activeIdx, updateTasks]);

  const finishTask = useCallback(() => {
    const task = tasks[activeIdx];
    const wasOvertime = task.elapsed > task.duration;

    // Log to Supabase
    logSession({
      task_id: task.id,
      task_label: task.label,
      duration_planned: task.duration,
      duration_actual: task.elapsed,
      completed_at: new Date().toISOString(),
      date: dayData.date,
      was_overtime: wasOvertime,
    });

    updateTasks((prev) => {
      const next = [...prev];
      const t = { ...next[activeIdx] };
      t.status = "done";
      t.completedCount += 1;
      next[activeIdx] = t;
      return next;
    });
    setRunning(false);
    setOvertime(false);
    setView("success");
  }, [activeIdx, tasks, dayData.date, updateTasks]);

  const continueAfterSuccess = useCallback(() => {
    if (tasks.some((t) => t.status === "pending")) {
      setView("list");
    } else {
      setView("allDone");
    }
  }, [tasks]);

  const resetAll = useCallback(() => {
    setDayData({ date: todayKey(), tasks: freshTasks() });
    setView("list");
    setActiveIdx(-1);
    setRunning(false);
    setOvertime(false);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt as BeforeInstallPromptEvent;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") setShowInstalled(true);
    setInstallPrompt(null);
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#6b7394]">Loading...</div>
      </div>
    );
  }

  // ── SPLASH SCREEN ──
  if (view === "splash") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen text-center px-4 cursor-pointer"
        onClick={() => setView("list")}
      >
        <img
          src="/gonchu.webp"
          alt="Ghochu"
          className="w-44 h-44 object-contain mb-4 animate-bounce"
          style={{ animationDuration: "2s" }}
        />
        <img src="/emoji/sticker_2.png" alt="" className="w-14 h-14 mb-4" />
        <h1 className="text-3xl font-bold mb-2">
          Hey Gonchuuu
        </h1>
        <p className="text-[#6b7394] text-sm mb-8">Ready to crush your non-negotiables?</p>
        <p className="text-[#4a5278] text-xs animate-pulse">tap anywhere to start</p>
      </div>
    );
  }

  const activeTask = activeIdx >= 0 ? tasks[activeIdx] : null;
  const remaining = activeTask ? activeTask.duration - activeTask.elapsed : 0;
  const progress = activeTask ? activeTask.elapsed / activeTask.duration : 0;
  const completedCount = tasks.filter((t) => t.status === "done").length;
  const totalMinutes = tasks.reduce((sum, t) => sum + t.completedCount * (t.duration / 60), 0);
  const streak = getStreak(history);

  // ── HISTORY VIEW ──
  if (view === "history") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setView("list")} className="text-[#5c7cfa] text-sm">&larr; Back</button>
          <h1 className="text-lg font-bold">Daily Progress</h1>
          <div className="w-12" />
        </div>

        {streak > 0 && (
          <div className="text-center mb-6 p-4 rounded-xl bg-[#111520] border border-[#1e2538]">
            <img src="/emoji/sticker_17.png" alt="Soldier" className="w-14 h-14 mb-1 mx-auto" />
            <div className="text-lg font-bold">{streak} day streak</div>
            <div className="text-[#6b7394] text-sm">Keep it going!</div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="text-center text-[#6b7394] mt-12">
            <p className="text-lg mb-2">No history yet</p>
            <p className="text-sm">Complete your first day to see progress here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((day) => (
              <div key={day.date} className="p-4 rounded-xl bg-[#111520] border border-[#1e2538]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{formatDate(day.date)}</span>
                  <span className="text-[#51cf66] text-sm">
                    {day.completedCount}/{day.totalCount}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="w-full h-1 bg-[#1e2538] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#51cf66] rounded-full"
                    style={{ width: `${(day.completedCount / day.totalCount) * 100}%` }}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {day.tasks.map((t) => (
                    <span
                      key={t.id}
                      title={t.label}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        t.status === "done" ? "bg-[#0d1a12] text-[#51cf66]" : "bg-[#1a1a1a] text-[#4a5278]"
                      }`}
                    >
                      {t.emoji} {t.completedCount > 1 ? `${t.completedCount}x` : ""}
                    </span>
                  ))}
                </div>
                <div className="text-[#6b7394] text-xs mt-2">{Math.round(day.totalMinutes)} min focused</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const motivation = getMotivation();

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Non-Negotiables</h1>
          <p className="text-[#6b7394] text-sm mt-1">{formatDateLong(dayData.date)}</p>
          <p className="text-[#6b7394] text-xs mt-0.5">
            {completedCount}/{tasks.length} completed
            {streak > 0 && <span className="ml-2">&#128293; {streak} day streak</span>}
          </p>
        </div>

        {/* Motivational quote */}
        <div className="text-center mb-6 px-4">
          <p className="text-[#4a5278] text-sm italic">&ldquo;{motivation.text}&rdquo;</p>
          {motivation.author && <p className="text-[#3d4566] text-xs mt-1">&mdash; {motivation.author}</p>}
        </div>

        <div className="w-full h-1.5 bg-[#1e2538] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[#5c7cfa] rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>

        <div className="space-y-3 flex-1">
          {tasks.map((task, idx) => (
            <div
              key={task.id}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                task.status === "done"
                  ? "bg-[#0d1a12] border-[#1a3520]"
                  : task.status === "skipped"
                  ? "bg-[#111520] border-[#1e2538] opacity-40"
                  : task.status === "active"
                  ? "bg-[#141830] border-[#5c7cfa]"
                  : "bg-[#111520] border-[#1e2538]"
              }`}
            >
              <span className="text-2xl">{task.emoji}</span>
              <div className="flex-1 text-left">
                <div className={`font-medium ${task.status === "done" && !task.repeatable ? "line-through text-[#6b7394]" : ""}`}>
                  {task.label}
                </div>
                <div className="text-sm text-[#6b7394]">
                  {task.duration / 60} min
                  {task.completedCount > 0 && (
                    <span className="ml-2 text-[#51cf66]">&#10003; {task.completedCount}x</span>
                  )}
                </div>
              </div>
              {task.status === "done" && task.repeatable ? (
                <button onClick={() => repeatTask(idx)} className="text-[#5c7cfa] text-sm font-medium hover:text-[#748ffc] transition-colors">
                  Again &rarr;
                </button>
              ) : task.status === "done" ? (
                <button onClick={() => untickTask(idx)} className="text-[#51cf66] text-lg hover:text-[#6b7394] transition-colors" title="Undo">&#10003;</button>
              ) : task.status === "skipped" ? (
                <span className="text-[#6b7394] text-sm">skipped</span>
              ) : (
                <button onClick={() => startTask(idx)} className="text-[#5c7cfa] text-sm font-medium hover:text-[#748ffc] transition-colors">
                  Start &rarr;
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3 pt-4 border-t border-[#1e2538]">
          {/* History button */}
          <button
            onClick={() => setView("history")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#1e2538] text-sm text-[#6b7394] hover:text-[#d4dae8] hover:border-[#5c7cfa] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
              <path d="M8 4v4l3 2M14 8a6 6 0 11-12 0 6 6 0 0112 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Daily Progress
          </button>

          {completedCount > 0 && (
            <button onClick={resetAll} className="w-full text-sm text-[#6b7394] hover:text-[#d4dae8] transition-colors py-2">
              Reset all sessions
            </button>
          )}

          {installPrompt && !showInstalled && (
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#1e2538] text-sm text-[#6b7394] hover:text-[#d4dae8] hover:border-[#5c7cfa] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
                <path d="M8 1v9m0 0L5 7m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Install App
            </button>
          )}
          {showInstalled && <p className="text-center text-xs text-[#6b7394]">&#10003; App installed</p>}
        </div>
      </div>
    );
  }

  // ── TIMER VIEW ──
  if (view === "timer" && activeTask) {
    const timerMotivation = TIMER_MOTIVATIONS[activeIdx % TIMER_MOTIVATIONS.length];
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen">
        {/* DND Reminder */}
        <div className="mb-4 px-4 py-2 rounded-lg bg-[#1a1a0a] border border-[#332200] text-center">
          <p className="text-[#f59e0b] text-xs font-medium">&#128244; Turn on Do Not Disturb for zero distractions</p>
        </div>

        {/* Contextual emoji */}
        <img
          src={overtime ? "/emoji/sticker_30.png" : running ? "/emoji/sticker_14.png" : "/emoji/sticker_1.png"}
          alt=""
          className="w-12 h-12 mb-2"
        />
        <div className="text-center mb-2"><span className="text-4xl">{activeTask.emoji}</span></div>
        <h2 className="text-xl font-semibold mb-1">{activeTask.label}</h2>
        <p className="text-[#6b7394] text-sm mb-8">Session {activeIdx + 1} of {tasks.length}</p>
        <div className="relative mb-8">
          <TimerRing progress={overtime ? 1 : progress} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {overtime ? (
              <>
                <span className="text-xs text-[#51cf66] font-medium mb-1">OVERTIME</span>
                <span className="text-4xl font-mono font-bold tracking-wider text-[#51cf66]">
                  +{formatTime(activeTask.elapsed - activeTask.duration)}
                </span>
                <span className="text-[#6b7394] text-xs mt-1">keep going or finish</span>
              </>
            ) : (
              <>
                <span className="text-4xl font-mono font-bold tracking-wider">{formatTime(remaining)}</span>
                <span className="text-[#6b7394] text-xs mt-1">{running ? "focusing" : "paused"}</span>
              </>
            )}
          </div>
        </div>

        {overtime && (
          <div className="text-center mb-4">
            <p className="text-[#51cf66] text-sm font-medium">Time&apos;s up! You&apos;re in the zone — keep going or wrap up.</p>
          </div>
        )}

        <div className="flex gap-3">
          {!overtime && (
            <button onClick={skipTask} className="px-5 py-2.5 rounded-lg border border-[#2a3352] text-[#6b7394] hover:text-[#d4dae8] hover:border-[#4a5278] transition-all text-sm">Skip</button>
          )}
          <button onClick={pauseResume} className={`px-8 py-2.5 rounded-lg font-medium text-sm transition-all ${running ? "bg-[#1a2240] text-[#5c7cfa] hover:bg-[#1a2d55]" : "bg-[#5c7cfa] text-white hover:bg-[#4263eb]"}`}>
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={finishTask} className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${overtime ? "bg-[#51cf66] text-[#090b10] hover:bg-[#40c057]" : "border border-[#1a3520] text-[#51cf66] hover:bg-[#0d1a12]"}`}>
            {overtime ? "Finish" : "Done"}
          </button>
        </div>

        {/* Timer motivation */}
        <p className="mt-8 text-[#4a5278] text-sm italic text-center max-w-xs">{timerMotivation}</p>
      </div>
    );
  }

  // ── SUCCESS VIEW ──
  if (view === "success" && activeTask) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <img src="/emoji/sticker_3.png" alt="Crushed it" className="w-20 h-20 mb-2" />
        <h2 className="text-2xl font-bold mb-2">Nice work, Gonchuuu!</h2>
        <p className="text-[#5c7cfa] text-sm mb-3 italic max-w-xs">{getSuccessMessage()}</p>
        <p className="text-[#6b7394] mb-1">
          You completed <span className="text-[#d4dae8] font-medium">{activeTask.label}</span>
        </p>
        {activeTask.completedCount > 1 && <p className="text-[#5c7cfa] text-sm mb-1">{activeTask.completedCount} times today</p>}
        <p className="text-[#6b7394] text-sm mb-8">{completedCount} of {tasks.length} sessions done</p>
        <div className="flex gap-2 mb-8">
          {tasks.map((t) => (
            <div key={t.id} className={`w-3 h-3 rounded-full transition-all ${t.status === "done" ? "bg-[#51cf66]" : t.status === "skipped" ? "bg-[#2a3352]" : "bg-[#1e2538]"}`} />
          ))}
        </div>
        <button onClick={continueAfterSuccess} className="px-8 py-3 bg-[#5c7cfa] text-white rounded-lg font-medium hover:bg-[#4263eb] transition-all">
          {tasks.every((t) => t.status === "done" || t.status === "skipped") ? "See Summary" : "Next Session \u2192"}
        </button>
      </div>
    );
  }

  // ── ALL DONE VIEW ──
  if (view === "allDone") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <img src="/emoji/sticker_28.png" alt="Beast mode" className="w-20 h-20 mb-2" />
        <img src="/gonchu.webp" alt="Ghochu" className="w-28 h-28 object-contain mb-2" />
        <h2 className="text-2xl font-bold mb-2">All Done, Gonchuuu!</h2>
        <p className="text-[#6b7394] mb-6">
          You focused for <span className="text-[#d4dae8] font-medium">{Math.round(totalMinutes)} minutes</span> today
        </p>
        <div className="w-full space-y-2 mb-8">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#111520] border border-[#1e2538]">
              <span className="text-lg">{task.emoji}</span>
              <span className="flex-1 text-left text-sm">{task.label}</span>
              {task.status === "done" ? (
                <span className="text-[#51cf66] text-sm">&#10003; {task.completedCount > 1 ? `${task.completedCount}x` : `${task.duration / 60}m`}</span>
              ) : (
                <span className="text-[#6b7394] text-sm">skipped</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView("history")} className="px-6 py-3 bg-[#111520] border border-[#1e2538] text-[#d4dae8] rounded-lg font-medium hover:border-[#5c7cfa] transition-all">
            View Progress
          </button>
          <button onClick={resetAll} className="px-6 py-3 bg-[#111520] border border-[#1e2538] text-[#6b7394] rounded-lg font-medium hover:border-[#4a5278] transition-all">
            Start Fresh
          </button>
        </div>
      </div>
    );
  }

  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
