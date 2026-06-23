-- Monet AI Director - EDLs + Refinement Schema (Phase 9)
-- Adds the edls table for storing generated + refined edit decision lists

-- Alter the existing edls table to add refinement columns
ALTER TABLE edls ADD COLUMN data TEXT;
ALTER TABLE edls ADD COLUMN previous_edl_id TEXT;
ALTER TABLE edls ADD COLUMN pacing_variance REAL;
ALTER TABLE edls ADD COLUMN used_fallback INTEGER DEFAULT 0;
ALTER TABLE edls ADD COLUMN feedback_text TEXT;

-- Create indexes for the new columns
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
