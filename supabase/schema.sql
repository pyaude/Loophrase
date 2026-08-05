-- Loophrase Supabase Schema
-- 云端同步表结构（§9.1）
-- 行级安全（RLS）：用户只能访问自己的数据

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== 表结构 ==========

-- 媒体项目（同步元数据，不含原视频文件）
CREATE TABLE IF NOT EXISTS media_project (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'video',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 练习切片
CREATE TABLE IF NOT EXISTS segment (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES media_project(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  text        TEXT NOT NULL,
  confidence  REAL,
  skip_type   TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 练习记录（仅同步结果，不同步录音文件）
CREATE TABLE IF NOT EXISTS practice_attempt (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id  UUID NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,
  result      TEXT,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 复习调度
CREATE TABLE IF NOT EXISTS review_schedule (
  segment_id    UUID PRIMARY KEY REFERENCES segment(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state         TEXT NOT NULL DEFAULT 'new',
  due_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interval_days INTEGER NOT NULL DEFAULT 0,
  review_count  INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 转写任务
CREATE TABLE IF NOT EXISTS transcription_job (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES media_project(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  expires_at  TIMESTAMPTZ,
  provider    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========== 索引 ==========

CREATE INDEX IF NOT EXISTS idx_segment_project ON segment(project_id);
CREATE INDEX IF NOT EXISTS idx_segment_user ON segment(user_id);
CREATE INDEX IF NOT EXISTS idx_attempt_segment ON practice_attempt(segment_id);
CREATE INDEX IF NOT EXISTS idx_attempt_user ON practice_attempt(user_id);
CREATE INDEX IF NOT EXISTS idx_review_user ON review_schedule(user_id);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_schedule(due_at);
CREATE INDEX IF NOT EXISTS idx_project_user ON media_project(user_id);

-- ========== RLS 策略 ==========

ALTER TABLE media_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_job ENABLE ROW LEVEL SECURITY;

-- 用户只能 CRUD 自己的数据
CREATE POLICY "users_select_own_projects" ON media_project
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_projects" ON media_project
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_projects" ON media_project
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_projects" ON media_project
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_all_own_segments" ON segment
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_all_own_attempts" ON practice_attempt
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_all_own_reviews" ON review_schedule
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_all_own_jobs" ON transcription_job
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ========== updated_at 触发器 ==========

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_media_project_updated_at
  BEFORE UPDATE ON media_project
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_segment_updated_at
  BEFORE UPDATE ON segment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_review_schedule_updated_at
  BEFORE UPDATE ON review_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_transcription_job_updated_at
  BEFORE UPDATE ON transcription_job
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
