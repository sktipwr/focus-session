-- Run this in your Supabase SQL Editor to set up the tables

-- Individual session logs (every completed timer)
CREATE TABLE session_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_label TEXT NOT NULL,
  duration_planned INTEGER NOT NULL,  -- seconds
  duration_actual INTEGER NOT NULL,   -- seconds (includes overtime)
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  was_overtime BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily summaries (one row per day, upserted)
CREATE TABLE daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_tasks INTEGER NOT NULL,
  completed_tasks INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  tasks_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast admin queries
CREATE INDEX idx_session_logs_date ON session_logs (date DESC);
CREATE INDEX idx_session_logs_task ON session_logs (task_id, date DESC);
CREATE INDEX idx_daily_summaries_date ON daily_summaries (date DESC);

-- Enable RLS (but allow inserts from anon for this simple use case)
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert and read (you're the only user)
CREATE POLICY "Allow all for anon" ON session_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON daily_summaries FOR ALL USING (true) WITH CHECK (true);
