-- Monet AI Director - Initial Database Schema (MVP)
-- This is the minimal schema needed for the Core Loop

-- Projects: Top-level container for user edits
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Media Items: Uploaded footage, music, reference videos
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('footage', 'music', 'reference')),
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL CHECK(r2_bucket IN ('MONET_MEDIA', 'MONET_RENDERS')),
  filename TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,

  -- Media metadata (extracted during upload)
  duration REAL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  codec TEXT,

  -- Gemini Files API reference
  gemini_file_id TEXT,
  gemini_upload_status TEXT CHECK(gemini_upload_status IN ('pending', 'uploading', 'complete', 'failed')),

  created_at INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_project ON media_items(project_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(type);

-- Edit Intents: The creative reasoning layer (THE MOAT)
CREATE TABLE IF NOT EXISTS edit_intents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- User input
  user_prompt TEXT NOT NULL,

  -- Extracted intent (JSON)
  intent_data TEXT NOT NULL,  -- Stores EditIntent JSON

  -- Metadata
  confidence REAL,  -- 0-1
  has_clarifying_questions INTEGER DEFAULT 0,  -- Boolean
  clarifying_questions TEXT,  -- JSON array if present

  created_at INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_project ON edit_intents(project_id);

-- Analysis Results: Cached footage/music analysis
CREATE TABLE IF NOT EXISTS analysis_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- Complete analysis (JSON) - stores AnalysisResult
  analysis_data TEXT NOT NULL,

  -- Cached for refinement reuse
  created_at INTEGER NOT NULL,
  expires_at INTEGER,  -- Optional TTL (24h default)

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_project ON analysis_results(project_id);

-- Edit Decision Lists: The generated edit plan
CREATE TABLE IF NOT EXISTS edls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  analysis_id TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- The EDL itself (JSON)
  edl_data TEXT NOT NULL,  -- Stores MonetEDL JSON

  -- Scoring (for variant comparison)
  beat_sync_score REAL,
  pacing_variance_score REAL,
  overall_confidence REAL,

  -- Generation metadata
  generation_time_ms INTEGER,
  model_used TEXT DEFAULT 'gemini-2.5-flash',

  created_at INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (intent_id) REFERENCES edit_intents(id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_id) REFERENCES analysis_results(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_edl_project ON edls(project_id);
CREATE INDEX IF NOT EXISTS idx_edl_intent ON edls(intent_id);
CREATE INDEX IF NOT EXISTS idx_edl_confidence ON edls(overall_confidence DESC);

-- Render Jobs: Export tracking (client-side only for MVP)
CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,
  edl_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'complete', 'failed')) DEFAULT 'queued',
  render_type TEXT NOT NULL CHECK(render_type IN ('client', 'server')) DEFAULT 'client',

  -- Output settings
  format TEXT NOT NULL DEFAULT 'mp4',
  quality TEXT NOT NULL DEFAULT '1080p',

  -- Progress tracking
  progress REAL DEFAULT 0,  -- 0-1
  current_frame INTEGER,
  total_frames INTEGER,

  -- Output location
  output_r2_key TEXT,
  output_r2_bucket TEXT CHECK(output_r2_bucket IN ('MONET_MEDIA', 'MONET_RENDERS')),
  output_size_bytes INTEGER,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,

  FOREIGN KEY (edl_id) REFERENCES edls(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_project ON render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_render_status ON render_jobs(status);
CREATE INDEX IF NOT EXISTS idx_render_created ON render_jobs(created_at DESC);

-- User Feedback: Learn from successful edits (post-MVP)
-- Commented out for MVP, but included for future reference
-- CREATE TABLE IF NOT EXISTS user_feedback (
--   id TEXT PRIMARY KEY,
--   edl_id TEXT NOT NULL,
--   project_id TEXT NOT NULL,
--   rating INTEGER CHECK(rating BETWEEN 1 AND 5),
--   would_use_again INTEGER,  -- Boolean
--   comments TEXT,
--   created_at INTEGER NOT NULL,
--   FOREIGN KEY (edl_id) REFERENCES edls(id) ON DELETE CASCADE,
--   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
-- );
