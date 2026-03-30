import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface SessionLog {
  id?: string;
  task_id: string;
  task_label: string;
  duration_planned: number; // seconds
  duration_actual: number; // seconds (includes overtime)
  completed_at: string; // ISO timestamp
  date: string; // YYYY-MM-DD
  was_overtime: boolean;
}

export async function logSession(session: Omit<SessionLog, "id">) {
  if (!supabase) return;
  const { error } = await supabase.from("session_logs").insert(session);
  if (error) console.error("Failed to log session:", error.message);
}

export async function syncDaySummary(
  date: string,
  tasks: { id: string; label: string; status: string; completedCount: number; duration: number }[]
) {
  if (!supabase) return;
  const completed = tasks.filter((t) => t.status === "done").length;
  const totalMinutes = tasks.reduce(
    (sum, t) => sum + t.completedCount * (t.duration / 60),
    0
  );

  const { error } = await supabase.from("daily_summaries").upsert(
    {
      date,
      total_tasks: tasks.length,
      completed_tasks: completed,
      total_minutes: Math.round(totalMinutes),
      tasks_json: JSON.stringify(tasks),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date" }
  );
  if (error) console.error("Failed to sync day summary:", error.message);
}
