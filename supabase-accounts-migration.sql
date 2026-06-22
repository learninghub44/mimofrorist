-- ====================================================
-- Mimohflorist — Customer Accounts Migration
-- Run this in your Supabase SQL Editor
-- ====================================================

-- 1. Customer profiles (linked to Supabase auth.users)
create table if not exists public.customer_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone       text,
  created_at  timestamptz default now()
);

-- Enable RLS
alter table public.customer_profiles enable row level security;

create policy "Users can view own profile"
  on public.customer_profiles for select
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on public.customer_profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.customer_profiles for update
  using (auth.uid() = id);

-- 2. Orders table (each WhatsApp checkout = one row)
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  total_amount  numeric(12,2),
  items_summary text,        -- "2× Red Roses, 1× Gift Box"
  voucher_code  text,
  discount_amt  numeric(12,2) default 0,
  created_at    timestamptz default now()
);

alter table public.orders enable row level security;

create policy "Users can view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Authenticated users can insert orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- 3. (Optional) newsletter subscribers — already exists if you ran the earlier migration
-- This is safe to re-run; it won't duplicate the table.
create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  created_at timestamptz default now()
);
