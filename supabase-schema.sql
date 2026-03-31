-- ══════════════════════════════════════════════════════════
-- FOCUSUM — Multi-User Schema
-- Run this in your Supabase SQL Editor
-- ══════════════════════════════════════════════════════════

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '😀',
  pin TEXT, -- optional 4-digit PIN for account recovery
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Session logs (every completed timer)
CREATE TABLE IF NOT EXISTS session_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_label TEXT NOT NULL,
  duration_planned INTEGER NOT NULL,
  duration_actual INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  was_overtime BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Daily summaries (one row per user per day)
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_tasks INTEGER NOT NULL,
  completed_tasks INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  tasks_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_session_logs_user_date ON session_logs (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_session_logs_date ON session_logs (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries (date DESC);

-- 5. RLS (allow all for anon — small trusted group)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON users;
DROP POLICY IF EXISTS "Allow all for anon" ON session_logs;
DROP POLICY IF EXISTS "Allow all for anon" ON daily_summaries;

CREATE POLICY "Allow all for anon" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON session_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON daily_summaries FOR ALL USING (true) WITH CHECK (true);

-- 6. Useful views for admin dashboard

-- Team daily leaderboard
CREATE OR REPLACE VIEW team_daily AS
SELECT
  ds.date,
  u.name,
  u.emoji,
  ds.completed_tasks,
  ds.total_tasks,
  ds.total_minutes,
  ROUND(ds.completed_tasks::numeric / NULLIF(ds.total_tasks, 0) * 100) as completion_pct
FROM daily_summaries ds
JOIN users u ON u.id = ds.user_id
ORDER BY ds.date DESC, ds.total_minutes DESC;

-- Team streaks (current streak per user)
CREATE OR REPLACE VIEW team_streaks AS
WITH ranked_days AS (
  SELECT
    user_id,
    date,
    completed_tasks,
    date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date))::int AS streak_group
  FROM daily_summaries
  WHERE completed_tasks > 0
),
streaks AS (
  SELECT
    user_id,
    streak_group,
    COUNT(*) as streak_length,
    MAX(date) as last_date
  FROM ranked_days
  GROUP BY user_id, streak_group
)
SELECT
  u.name,
  u.emoji,
  COALESCE(MAX(s.streak_length) FILTER (WHERE s.last_date >= CURRENT_DATE - 1), 0) as current_streak,
  COALESCE(MAX(s.streak_length), 0) as best_streak
FROM users u
LEFT JOIN streaks s ON s.user_id = u.id
GROUP BY u.id, u.name, u.emoji;
