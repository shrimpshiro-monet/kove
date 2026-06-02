-- Migration 003: Reference styles table
-- Stores analyzed editing DNA from reference videos for project reuse

CREATE TABLE IF NOT EXISTS reference_styles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  style_data TEXT NOT NULL, -- JSON: ReferenceStyle
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_styles_project_id ON reference_styles (project_id);
