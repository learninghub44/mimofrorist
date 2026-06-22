-- ====================================================
-- Mimohflorist — product_reviews table
-- Run in Supabase SQL Editor
-- ====================================================

create table if not exists public.product_reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  reviewer_name text,
  body         text,
  approved     boolean default false,
  created_at   timestamptz default now()
);

alter table public.product_reviews enable row level security;

-- Anyone can submit a review
drop policy if exists "Anyone can submit reviews" on public.product_reviews;
create policy "Anyone can submit reviews"
  on public.product_reviews for insert
  with check (true);

-- Anyone can read approved reviews
drop policy if exists "Anyone can read approved reviews" on public.product_reviews;
create policy "Anyone can read approved reviews"
  on public.product_reviews for select
  using (approved = true);
