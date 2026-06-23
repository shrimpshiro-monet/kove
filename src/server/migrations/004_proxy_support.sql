-- Migration 004: Add proxy support to media_items
-- Adds proxy_r2_key to store browser-safe preview proxies for uploaded footage

ALTER TABLE media_items ADD COLUMN proxy_r2_key TEXT;
