"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

const TASK_TEMPLATES: Omit<Task, "status" | "elapsed" | "completedCount">[] = [
  { id: "morning-pages", label: "Morning Pages", emoji: "\u270D\uFE0F", duration: 15 * 60, repeatable: true },
  { id: "food", label: "Prepare Food", emoji: "\uD83C\uDF73", duration: 15 * 60, repeatable: false },
  { id: "journal", label: "Write Journal", emoji: "\uD83D\uDCD3", duration: 15 * 60, repeatable: false },
  { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFCB\uFE0F", duration: 15 * 60, repeatable: false },
  { id: "study-1", label: "Study Session 1", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-2", label: "Study Session 2", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-3", label: "Study Session 3", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
];

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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#222" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3b82f6"
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

type View = "list" | "timer" | "success" | "allDone" | "history";

export default function Home() {
  const [dayData, setDayData] = useState<TodayData>({ date: todayKey(), tasks: freshTasks() });
  const [view, setView] = useState<View>("list");
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [running, setRunning] = useState(false);
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
    if (mounted) saveToday(dayData);
  }, [dayData, mounted]);

  useEffect(() => {
    if (running && activeIdx >= 0) {
      intervalRef.current = setInterval(() => {
        updateTasks((prev) => {
          const next = [...prev];
          const task = { ...next[activeIdx] };
          task.elapsed += 1;
          if (task.elapsed >= task.duration) {
            task.status = "done";
            task.elapsed = task.duration;
            task.completedCount += 1;
            next[activeIdx] = task;
            setRunning(false);
            setView("success");
            return next;
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
    setView("timer");
  }, [updateTasks]);

  const repeatTask = useCallback((idx: number) => {
    updateTasks((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "pending", elapsed: 0 };
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
    setView("list");
  }, [activeIdx, updateTasks]);

  const markDoneEarly = useCallback(() => {
    updateTasks((prev) => {
      const next = [...prev];
      const task = { ...next[activeIdx] };
      task.status = "done";
      task.elapsed = task.duration;
      task.completedCount += 1;
      next[activeIdx] = task;
      return next;
    });
    setRunning(false);
    setView("success");
  }, [activeIdx, updateTasks]);

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
        <div className="text-[#737373]">Loading...</div>
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
          <button onClick={() => setView("list")} className="text-[#3b82f6] text-sm">&larr; Back</button>
          <h1 className="text-lg font-bold">Daily Progress</h1>
          <div className="w-12" />
        </div>

        {streak > 0 && (
          <div className="text-center mb-6 p-4 rounded-xl bg-[#141414] border border-[#222]">
            <div className="text-3xl mb-1">&#128293;</div>
            <div className="text-lg font-bold">{streak} day streak</div>
            <div className="text-[#737373] text-sm">Keep it going!</div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="text-center text-[#737373] mt-12">
            <p className="text-lg mb-2">No history yet</p>
            <p className="text-sm">Complete your first day to see progress here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((day) => (
              <div key={day.date} className="p-4 rounded-xl bg-[#141414] border border-[#222]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{formatDate(day.date)}</span>
                  <span className="text-[#22c55e] text-sm">
                    {day.completedCount}/{day.totalCount}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="w-full h-1 bg-[#222] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#22c55e] rounded-full"
                    style={{ width: `${(day.completedCount / day.totalCount) * 100}%` }}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {day.tasks.map((t) => (
                    <span
                      key={t.id}
                      title={t.label}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        t.status === "done" ? "bg-[#0a1a0a] text-[#22c55e]" : "bg-[#1a1a1a] text-[#555]"
                      }`}
                    >
                      {t.emoji} {t.completedCount > 1 ? `${t.completedCount}x` : ""}
                    </span>
                  ))}
                </div>
                <div className="text-[#737373] text-xs mt-2">{Math.round(day.totalMinutes)} min focused</div>
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
          <p className="text-[#737373] text-sm mt-1">{formatDateLong(dayData.date)}</p>
          <p className="text-[#737373] text-xs mt-0.5">
            {completedCount}/{tasks.length} completed
            {streak > 0 && <span className="ml-2">&#128293; {streak} day streak</span>}
          </p>
        </div>

        {/* Motivational quote */}
        <div className="text-center mb-6 px-4">
          <p className="text-[#555] text-sm italic">&ldquo;{motivation.text}&rdquo;</p>
          {motivation.author && <p className="text-[#444] text-xs mt-1">&mdash; {motivation.author}</p>}
        </div>

        <div className="w-full h-1.5 bg-[#222] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>

        <div className="space-y-3 flex-1">
          {tasks.map((task, idx) => (
            <div
              key={task.id}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                task.status === "done"
                  ? "bg-[#0a1a0a] border-[#1a3a1a]"
                  : task.status === "skipped"
                  ? "bg-[#141414] border-[#222] opacity-40"
                  : task.status === "active"
                  ? "bg-[#1a1a2e] border-[#3b82f6]"
                  : "bg-[#141414] border-[#222]"
              }`}
            >
              <span className="text-2xl">{task.emoji}</span>
              <div className="flex-1 text-left">
                <div className={`font-medium ${task.status === "done" && !task.repeatable ? "line-through text-[#737373]" : ""}`}>
                  {task.label}
                </div>
                <div className="text-sm text-[#737373]">
                  {task.duration / 60} min
                  {task.completedCount > 0 && (
                    <span className="ml-2 text-[#22c55e]">&#10003; {task.completedCount}x</span>
                  )}
                </div>
              </div>
              {task.status === "done" && task.repeatable ? (
                <button onClick={() => repeatTask(idx)} className="text-[#3b82f6] text-sm font-medium hover:text-[#60a5fa] transition-colors">
                  Again &rarr;
                </button>
              ) : task.status === "done" ? (
                <span className="text-[#22c55e] text-lg">&#10003;</span>
              ) : task.status === "skipped" ? (
                <span className="text-[#737373] text-sm">skipped</span>
              ) : (
                <button onClick={() => startTask(idx)} className="text-[#3b82f6] text-sm font-medium hover:text-[#60a5fa] transition-colors">
                  Start &rarr;
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3 pt-4 border-t border-[#222]">
          {/* History button */}
          <button
            onClick={() => setView("history")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#222] text-sm text-[#737373] hover:text-[#e5e5e5] hover:border-[#3b82f6] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
              <path d="M8 4v4l3 2M14 8a6 6 0 11-12 0 6 6 0 0112 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Daily Progress
          </button>

          {completedCount > 0 && (
            <button onClick={resetAll} className="w-full text-sm text-[#737373] hover:text-[#e5e5e5] transition-colors py-2">
              Reset all sessions
            </button>
          )}

          {installPrompt && !showInstalled && (
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#222] text-sm text-[#737373] hover:text-[#e5e5e5] hover:border-[#3b82f6] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
                <path d="M8 1v9m0 0L5 7m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Install App
            </button>
          )}
          {showInstalled && <p className="text-center text-xs text-[#737373]">&#10003; App installed</p>}
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
        <div className="mb-6 px-4 py-2 rounded-lg bg-[#1a1a0a] border border-[#332200] text-center">
          <p className="text-[#f59e0b] text-xs font-medium">&#128244; Turn on Do Not Disturb for zero distractions</p>
        </div>

        <div className="text-center mb-2"><span className="text-4xl">{activeTask.emoji}</span></div>
        <h2 className="text-xl font-semibold mb-1">{activeTask.label}</h2>
        <p className="text-[#737373] text-sm mb-8">Session {activeIdx + 1} of {tasks.length}</p>
        <div className="relative mb-8">
          <TimerRing progress={progress} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-mono font-bold tracking-wider">{formatTime(remaining)}</span>
            <span className="text-[#737373] text-xs mt-1">{running ? "focusing" : "paused"}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={skipTask} className="px-5 py-2.5 rounded-lg border border-[#333] text-[#737373] hover:text-[#e5e5e5] hover:border-[#555] transition-all text-sm">Skip</button>
          <button onClick={pauseResume} className={`px-8 py-2.5 rounded-lg font-medium text-sm transition-all ${running ? "bg-[#1e293b] text-[#3b82f6] hover:bg-[#1e3a5f]" : "bg-[#3b82f6] text-white hover:bg-[#2563eb]"}`}>
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={markDoneEarly} className="px-5 py-2.5 rounded-lg border border-[#1a3a1a] text-[#22c55e] hover:bg-[#0a1a0a] transition-all text-sm">Done</button>
        </div>

        {/* Timer motivation */}
        <p className="mt-8 text-[#555] text-sm italic text-center max-w-xs">{timerMotivation}</p>
      </div>
    );
  }

  // ── SUCCESS VIEW ──
  if (view === "success" && activeTask) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <div className="text-6xl mb-4">&#127881;</div>
        <h2 className="text-2xl font-bold mb-2">Nice work!</h2>
        <p className="text-[#3b82f6] text-sm mb-3 italic max-w-xs">{getSuccessMessage()}</p>
        <p className="text-[#737373] mb-1">
          You completed <span className="text-[#e5e5e5] font-medium">{activeTask.label}</span>
        </p>
        {activeTask.completedCount > 1 && <p className="text-[#3b82f6] text-sm mb-1">{activeTask.completedCount} times today</p>}
        <p className="text-[#737373] text-sm mb-8">{completedCount} of {tasks.length} sessions done</p>
        <div className="flex gap-2 mb-8">
          {tasks.map((t) => (
            <div key={t.id} className={`w-3 h-3 rounded-full transition-all ${t.status === "done" ? "bg-[#22c55e]" : t.status === "skipped" ? "bg-[#333]" : "bg-[#222]"}`} />
          ))}
        </div>
        <button onClick={continueAfterSuccess} className="px-8 py-3 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-[#2563eb] transition-all">
          {tasks.every((t) => t.status === "done" || t.status === "skipped") ? "See Summary" : "Next Session \u2192"}
        </button>
      </div>
    );
  }

  // ── ALL DONE VIEW ──
  if (view === "allDone") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <div className="text-6xl mb-4">&#9989;</div>
        <h2 className="text-2xl font-bold mb-2">All Done for Today!</h2>
        <p className="text-[#737373] mb-6">
          You focused for <span className="text-[#e5e5e5] font-medium">{Math.round(totalMinutes)} minutes</span> today
        </p>
        <div className="w-full space-y-2 mb-8">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#141414] border border-[#222]">
              <span className="text-lg">{task.emoji}</span>
              <span className="flex-1 text-left text-sm">{task.label}</span>
              {task.status === "done" ? (
                <span className="text-[#22c55e] text-sm">&#10003; {task.completedCount > 1 ? `${task.completedCount}x` : `${task.duration / 60}m`}</span>
              ) : (
                <span className="text-[#737373] text-sm">skipped</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView("history")} className="px-6 py-3 bg-[#141414] border border-[#222] text-[#e5e5e5] rounded-lg font-medium hover:border-[#3b82f6] transition-all">
            View Progress
          </button>
          <button onClick={resetAll} className="px-6 py-3 bg-[#141414] border border-[#222] text-[#737373] rounded-lg font-medium hover:border-[#555] transition-all">
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
