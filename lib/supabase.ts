import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// ── User management ──

export interface AppUser {
  id: string;
  name: string;
  emoji: string;
  is_admin: boolean;
  created_at: string;
}

export async function createUser(name: string, emoji: string, pin?: string): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .insert({ name, emoji, pin: pin || null, is_admin: false })
    .select()
    .single();
  if (error) { console.error("Create user error:", error.message); return null; }
  return data;
}

export async function getUser(userId: string): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

export async function getAllUsers(): Promise<AppUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

export async function recoverUser(name: string, pin: string): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("name", name)
    .eq("pin", pin)
    .single();
  if (error) return null;
  return data;
}

// ── Session logging ──

export interface SessionLog {
  id?: string;
  user_id: string;
  task_id: string;
  task_label: string;
  duration_planned: number;
  duration_actual: number;
  completed_at: string;
  date: string;
  was_overtime: boolean;
}

export async function logSession(session: Omit<SessionLog, "id">) {
  if (!supabase) return;
  const { error } = await supabase.from("session_logs").insert(session);
  if (error) console.error("Log session error:", error.message);
}

// ── Daily summaries ──

export async function syncDaySummary(
  userId: string,
  date: string,
  tasks: { id: string; label: string; status: string; completedCount: number; duration: number }[]
) {
  if (!supabase) return;
  const completed = tasks.filter((t) => t.status === "done").length;
  const totalMinutes = tasks.reduce((sum, t) => sum + t.completedCount * (t.duration / 60), 0);

  const { error } = await supabase.from("daily_summaries").upsert(
    {
      user_id: userId,
      date,
      total_tasks: tasks.length,
      completed_tasks: completed,
      total_minutes: Math.round(totalMinutes),
      tasks_json: JSON.stringify(tasks),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  );
  if (error) console.error("Sync summary error:", error.message);
}

// ── Team data (for admin/insights) ──

export interface TeamDayEntry {
  date: string;
  name: string;
  emoji: string;
  completed_tasks: number;
  total_tasks: number;
  total_minutes: number;
  completion_pct: number;
}

export async function getTeamDaily(days: number = 7): Promise<TeamDayEntry[]> {
  if (!supabase) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("team_daily")
    .select("*")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });
  if (error) return [];
  return data || [];
}

export interface TeamStreak {
  name: string;
  emoji: string;
  current_streak: number;
  best_streak: number;
}

export async function getTeamStreaks(): Promise<TeamStreak[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("team_streaks").select("*");
  if (error) return [];
  return data || [];
}

export async function getUserHistory(userId: string, days: number = 30) {
  if (!supabase) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("daily_summaries")
    .select("*")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });
  if (error) return [];
  return data || [];
}
