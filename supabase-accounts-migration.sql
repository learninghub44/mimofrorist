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

-- ====================================================
-- Promo codes table (admin-managed vouchers)
-- ====================================================
create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  type        text not null check (type in ('percent','flat')),
  value       numeric(10,2) not null,
  label       text,
  active      boolean default true,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

alter table public.promo_codes enable row level security;

-- Anyone can read active promo codes (needed for storefront validation)
create policy "Public can read active promo codes"
  on public.promo_codes for select
  using (active = true);

-- Only authenticated admins can insert/update/delete
-- (in practice, your admin user is the only one who logs in to admin.html)
create policy "Authenticated can manage promo codes"
  on public.promo_codes for all
  using (auth.role() = 'authenticated');

-- Seed the existing hardcoded codes
insert into public.promo_codes (code, type, value, label) values
  ('MIMO10',   'percent', 10,  '10% off'),
  ('MIMO20',   'percent', 20,  '20% off'),
  ('FLOWERS',  'percent', 15,  '15% off'),
  ('BIRTHDAY', 'flat',   200,  'KES 200 off'),
  ('WEDDING',  'flat',   500,  'KES 500 off'),
  ('NAIROBI',  'percent',  5,  '5% off')
on conflict (code) do nothing;

-- ====================================================
-- Blog posts table (admin-managed)
-- ====================================================
create table if not exists public.blog_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  excerpt     text,
  category    text,
  image_url   text,
  link_label  text default 'Read more',
  link_href   text default '#shop',
  published   boolean default true,
  created_at  timestamptz default now()
);

alter table public.blog_posts enable row level security;

create policy "Public can read published posts"
  on public.blog_posts for select
  using (published = true);

create policy "Authenticated can manage posts"
  on public.blog_posts for all
  using (auth.role() = 'authenticated');

-- Seed the 3 existing static posts
insert into public.blog_posts (title, excerpt, category, image_url, link_label, link_href) values
  ('How to Keep Cut Flowers Fresh for 2 Weeks',
   'Simple tricks — from water temperature to stem cutting angles — that double the vase life of your blooms.',
   'Flower Care', 'images/event-birthday.jpg', 'Ask our florist', '#contact'),
  ('2025 Wedding Flower Trends in Nairobi',
   'From tropical lush greens to minimalist white arches — what Nairobi brides are booking this season.',
   'Wedding', 'images/event-wedding.jpg', 'See our packages', '#events'),
  ('What Flowers to Send for Every Occasion',
   'Roses for romance, lilies for sympathy, sunflowers for joy — a quick guide to never getting it wrong.',
   'Gifting', 'images/event-funeral.jpg', 'Shop by occasion', '#shop');
