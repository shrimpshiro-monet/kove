-- Monet AI Director - EDLs + Refinement Schema (Phase 9)
-- Adds the edls table for storing generated + refined edit decision lists

-- EDLs: Generated edit decision lists (one per generation or refinement)
CREATE TABLE IF NOT EXISTS edls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- Version track so UI can show "Iteration 3 of 5"
  version INTEGER NOT NULL DEFAULT 1,

  -- The full MonetEDL JSON — Zod validated before insert
  data TEXT NOT NULL,

  -- Back-link to the EDL this was refined from (null = original)
  previous_edl_id TEXT,

  -- Scores computed at generation time
  beat_sync_score REAL,
  pacing_variance REAL,
  overall_confidence REAL,

  -- Whether deterministic fallback was used
  used_fallback INTEGER DEFAULT 0,

  -- The feedback that triggered this refinement (null = original)
  feedback_text TEXT,

  created_at INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_edl_id) REFERENCES edls(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_edls_project ON edls(project_id);
CREATE INDEX IF NOT EXISTS idx_edls_previous ON edls(previous_edl_id);

-- Transcripts: Word-level transcripts for Aesthetic Dissection (Phase 7B)
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('footage', 'music')),

  -- The full TranscriptResult JSON (word-level timestamps + intensity)
  data TEXT NOT NULL,

  created_at INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_media ON transcripts(media_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_project ON transcripts(project_id);
