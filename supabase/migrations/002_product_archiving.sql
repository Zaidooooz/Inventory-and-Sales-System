-- ============================================================
-- Migration: add archiving support to products
-- Run this once in Supabase: SQL Editor > New query > paste > Run
--
-- Why: products that have already been sold or ordered can't be hard-deleted
-- (it would break sales/purchase history). This adds an "is_active" flag so
-- such products can be archived (hidden from normal use) instead of deleted.
-- ============================================================

alter table products add column if not exists is_active boolean not null default true;

-- refresh the products policies to no-op if they already exist; safe to re-run
-- (no policy changes needed — is_active is just a regular column, existing
-- select/write policies already cover it)
