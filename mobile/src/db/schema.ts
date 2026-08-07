// SQLite Schema：所有建表语句（对应 §9.4 核心数据实体）

export const SCHEMA_SQL = `
-- 媒体项目
CREATE TABLE IF NOT EXISTS media_project (
  id            TEXT PRIMARY KEY NOT NULL,
  title         TEXT NOT NULL,
  local_uri     TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  source_type   TEXT NOT NULL,
  has_audio     INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 字幕来源
CREATE TABLE IF NOT EXISTS subtitle_source (
  id          TEXT PRIMARY KEY NOT NULL,
  project_id  TEXT NOT NULL REFERENCES media_project(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'en',
  version     INTEGER NOT NULL DEFAULT 1,
  raw_content TEXT,
  created_at  INTEGER NOT NULL
);

-- 练习切片（虚拟片段，不生成独立媒体文件）
CREATE TABLE IF NOT EXISTS segment (
  id           TEXT PRIMARY KEY NOT NULL,
  project_id   TEXT NOT NULL REFERENCES media_project(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL,
  start_ms     INTEGER NOT NULL,
  end_ms       INTEGER NOT NULL,
  text         TEXT NOT NULL,
  confidence   REAL,
  skip_type    TEXT,
  source       TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- 练习记录
CREATE TABLE IF NOT EXISTS practice_attempt (
  id            TEXT PRIMARY KEY NOT NULL,
  segment_id    TEXT NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL,
  result        TEXT,
  recording_uri TEXT,
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL
);

-- 复习调度
CREATE TABLE IF NOT EXISTS review_schedule (
  segment_id     TEXT PRIMARY KEY NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
  state          TEXT NOT NULL,
  due_at         INTEGER NOT NULL,
  interval_days  INTEGER NOT NULL DEFAULT 0,
  review_count   INTEGER NOT NULL DEFAULT 0,
  listen_count   INTEGER NOT NULL DEFAULT 0,
  read_count     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);

-- 转写任务
CREATE TABLE IF NOT EXISTS transcription_job (
  id          TEXT PRIMARY KEY NOT NULL,
  project_id  TEXT NOT NULL REFERENCES media_project(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  expires_at  INTEGER,
  provider    TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_segment_project ON segment(project_id);
CREATE INDEX IF NOT EXISTS idx_segment_order ON segment(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_attempt_segment ON practice_attempt(segment_id);
CREATE INDEX IF NOT EXISTS idx_review_state ON review_schedule(state);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_schedule(due_at);
CREATE INDEX IF NOT EXISTS idx_subtitle_project ON subtitle_source(project_id);
CREATE INDEX IF NOT EXISTS idx_attempt_created ON practice_attempt(created_at);
`;
