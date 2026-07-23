-- D1 migration: clip analysis cache tables

CREATE TABLE IF NOT EXISTS clip_analysis (
  clip_id TEXT PRIMARY KEY,
  analysis_data TEXT NOT NULL,
  analyzed_at INTEGER NOT NULL,
  duration REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS clip_vision (
  clip_id TEXT PRIMARY KEY,
  vision_data TEXT NOT NULL,
  analyzed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clip_analysis_at ON clip_analysis(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_clip_vision_at ON clip_vision(analyzed_at);
