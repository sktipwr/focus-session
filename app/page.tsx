"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type TaskStatus = "pending" | "active" | "done" | "skipped";

interface Task {
  id: string;
  label: string;
  emoji: string;
  duration: number; // seconds
  status: TaskStatus;
  elapsed: number; // seconds elapsed
}

const INITIAL_TASKS: Task[] = [
  { id: "food", label: "Prepare Food", emoji: "\uD83C\uDF73", duration: 15 * 60, status: "pending", elapsed: 0 },
  { id: "journal", label: "Write Journal", emoji: "\uD83D\uDCD3", duration: 15 * 60, status: "pending", elapsed: 0 },
  { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFCB\uFE0F", duration: 15 * 60, status: "pending", elapsed: 0 },
  { id: "study-1", label: "Study Session 1", emoji: "\uD83D\uDCDA", duration: 30 * 60, status: "pending", elapsed: 0 },
  { id: "study-2", label: "Study Session 2", emoji: "\uD83D\uDCDA", duration: 30 * 60, status: "pending", elapsed: 0 },
  { id: "study-3", label: "Study Session 3", emoji: "\uD83D\uDCDA", duration: 30 * 60, status: "pending", elapsed: 0 },
];

const STORAGE_KEY = "focus-session-tasks";

function loadTasks(): Task[] {
  if (typeof window === "undefined") return INITIAL_TASKS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return INITIAL_TASKS;
}

function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Circular progress ring
function TimerRing({
  progress,
  size = 220,
  stroke = 8,
}: {
  progress: number;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#222"
        strokeWidth={stroke}
      />
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

type View = "list" | "timer" | "success" | "allDone";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [view, setView] = useState<View>("list");
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadTasks();
    setTasks(loaded);
    // Check if all done
    if (loaded.every((t) => t.status === "done" || t.status === "skipped")) {
      setView("allDone");
    }
    setMounted(true);
  }, []);

  // Save to localStorage on task change
  useEffect(() => {
    if (mounted) saveTasks(tasks);
  }, [tasks, mounted]);

  // Timer tick
  useEffect(() => {
    if (running && activeIdx >= 0) {
      intervalRef.current = setInterval(() => {
        setTasks((prev) => {
          const next = [...prev];
          const task = { ...next[activeIdx] };
          task.elapsed += 1;
          if (task.elapsed >= task.duration) {
            task.status = "done";
            task.elapsed = task.duration;
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
  }, [running, activeIdx]);

  const startTask = useCallback(
    (idx: number) => {
      setTasks((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: "active" };
        return next;
      });
      setActiveIdx(idx);
      setRunning(true);
      setView("timer");
    },
    []
  );

  const pauseResume = useCallback(() => {
    setRunning((r) => !r);
  }, []);

  const skipTask = useCallback(() => {
    setTasks((prev) => {
      const next = [...prev];
      next[activeIdx] = { ...next[activeIdx], status: "skipped" };
      return next;
    });
    setRunning(false);
    goToNextOrDone();
  }, [activeIdx]);

  const markDoneEarly = useCallback(() => {
    setTasks((prev) => {
      const next = [...prev];
      next[activeIdx] = { ...next[activeIdx], status: "done", elapsed: next[activeIdx].duration };
      return next;
    });
    setRunning(false);
    setView("success");
  }, [activeIdx]);

  const goToNextOrDone = useCallback(() => {
    const nextPending = tasks.findIndex((t, i) => i > activeIdx && t.status === "pending");
    if (nextPending === -1) {
      // Check any remaining pending
      const anyPending = tasks.findIndex((t) => t.status === "pending");
      if (anyPending === -1) {
        setView("allDone");
      } else {
        setView("list");
      }
    } else {
      setView("list");
    }
  }, [tasks, activeIdx]);

  const continueAfterSuccess = useCallback(() => {
    goToNextOrDone();
  }, [goToNextOrDone]);

  const resetAll = useCallback(() => {
    setTasks(INITIAL_TASKS);
    setView("list");
    setActiveIdx(-1);
    setRunning(false);
  }, []);

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
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.status === "done" ? t.duration : 0), 0) / 60;

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Focus Session</h1>
          <p className="text-[#737373] text-sm mt-1">
            {completedCount}/{tasks.length} completed
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[#222] rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>

        <div className="space-y-3">
          {tasks.map((task, idx) => (
            <button
              key={task.id}
              disabled={task.status === "done" || task.status === "skipped"}
              onClick={() => startTask(idx)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                task.status === "done"
                  ? "bg-[#0a1a0a] border-[#1a3a1a] opacity-70"
                  : task.status === "skipped"
                  ? "bg-[#141414] border-[#222] opacity-40"
                  : "bg-[#141414] border-[#222] hover:border-[#3b82f6] hover:bg-[#1a1a2e] cursor-pointer"
              }`}
            >
              <span className="text-2xl">{task.emoji}</span>
              <div className="flex-1 text-left">
                <div className={`font-medium ${task.status === "done" ? "line-through text-[#737373]" : ""}`}>
                  {task.label}
                </div>
                <div className="text-sm text-[#737373]">{task.duration / 60} min</div>
              </div>
              {task.status === "done" && (
                <span className="text-[#22c55e] text-lg">&#10003;</span>
              )}
              {task.status === "skipped" && (
                <span className="text-[#737373] text-sm">skipped</span>
              )}
              {task.status === "pending" && (
                <span className="text-[#3b82f6] text-sm font-medium">Start &rarr;</span>
              )}
            </button>
          ))}
        </div>

        {completedCount > 0 && (
          <button
            onClick={resetAll}
            className="mt-8 mx-auto block text-sm text-[#737373] hover:text-[#e5e5e5] transition-colors"
          >
            Reset all sessions
          </button>
        )}
      </div>
    );
  }

  // ── TIMER VIEW ──
  if (view === "timer" && activeTask) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center mb-2">
          <span className="text-4xl">{activeTask.emoji}</span>
        </div>
        <h2 className="text-xl font-semibold mb-1">{activeTask.label}</h2>
        <p className="text-[#737373] text-sm mb-8">
          Session {activeIdx + 1} of {tasks.length}
        </p>

        {/* Timer ring */}
        <div className="relative mb-8">
          <TimerRing progress={progress} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-mono font-bold tracking-wider">
              {formatTime(remaining)}
            </span>
            <span className="text-[#737373] text-xs mt-1">
              {running ? "focusing" : "paused"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <button
            onClick={skipTask}
            className="px-5 py-2.5 rounded-lg border border-[#333] text-[#737373] hover:text-[#e5e5e5] hover:border-[#555] transition-all text-sm"
          >
            Skip
          </button>
          <button
            onClick={pauseResume}
            className={`px-8 py-2.5 rounded-lg font-medium text-sm transition-all ${
              running
                ? "bg-[#1e293b] text-[#3b82f6] hover:bg-[#1e3a5f]"
                : "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
            }`}
          >
            {running ? "Pause" : "Resume"}
          </button>
          <button
            onClick={markDoneEarly}
            className="px-5 py-2.5 rounded-lg border border-[#1a3a1a] text-[#22c55e] hover:bg-[#0a1a0a] transition-all text-sm"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── SUCCESS VIEW ──
  if (view === "success" && activeTask) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <div className="text-6xl mb-4">&#127881;</div>
        <h2 className="text-2xl font-bold mb-2">Nice work!</h2>
        <p className="text-[#737373] mb-1">
          You completed <span className="text-[#e5e5e5] font-medium">{activeTask.label}</span>
        </p>
        <p className="text-[#737373] text-sm mb-8">
          {completedCount} of {tasks.length} sessions done
        </p>

        {/* Mini progress dots */}
        <div className="flex gap-2 mb-8">
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`w-3 h-3 rounded-full transition-all ${
                t.status === "done"
                  ? "bg-[#22c55e]"
                  : t.status === "skipped"
                  ? "bg-[#333]"
                  : "bg-[#222]"
              }`}
            />
          ))}
        </div>

        <button
          onClick={continueAfterSuccess}
          className="px-8 py-3 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-[#2563eb] transition-all"
        >
          {tasks.every((t) => t.status === "done" || t.status === "skipped")
            ? "See Summary"
            : "Next Session \u2192"}
        </button>
      </div>
    );
  }

  // ── ALL DONE VIEW ──
  if (view === "allDone") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen text-center">
        <div className="text-6xl mb-4">&#9989;</div>
        <h2 className="text-2xl font-bold mb-2">All Sessions Complete!</h2>
        <p className="text-[#737373] mb-6">
          You focused for <span className="text-[#e5e5e5] font-medium">{Math.round(totalMinutes)} minutes</span> today
        </p>

        <div className="w-full space-y-2 mb-8">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-[#141414] border border-[#222]"
            >
              <span className="text-lg">{task.emoji}</span>
              <span className="flex-1 text-left text-sm">{task.label}</span>
              {task.status === "done" ? (
                <span className="text-[#22c55e] text-sm">&#10003; {task.duration / 60}m</span>
              ) : (
                <span className="text-[#737373] text-sm">skipped</span>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={resetAll}
          className="px-8 py-3 bg-[#141414] border border-[#222] text-[#e5e5e5] rounded-lg font-medium hover:border-[#3b82f6] transition-all"
        >
          Start Fresh
        </button>
      </div>
    );
  }

  return null;
}
