-- Add rotation and aspect_ratio columns to media_items
-- These are extracted from client-side video probing during upload

ALTER TABLE media_items ADD COLUMN rotation INTEGER DEFAULT 0;
ALTER TABLE media_items ADD COLUMN aspect_ratio REAL;
