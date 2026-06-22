-- ============================================================
-- Mimohflorist & Gift Shop — Migration: merchandising fields
-- Run this once in Supabase SQL Editor (safe to re-run, uses IF NOT EXISTS)
-- Adds: sale pricing + homepage section badges (Best Seller, New, Sale, etc.)
-- ============================================================

alter table products add column if not exists sale_price numeric(10,2);
alter table products add column if not exists badge text;
alter table products add column if not exists is_best_seller boolean not null default false;
alter table products add column if not exists is_new_arrival boolean not null default false;

-- badge: free-text label shown on the product card, e.g. 'Sale', 'New', 'Hot'
-- sale_price: when set (and lower than price), shows as the discounted price
--   with the original price struck through, same pattern as the reference site
-- is_best_seller / is_new_arrival: drive the homepage curated carousels,
--   independent of "featured" so you can curate each section separately
