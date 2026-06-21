-- ============================================================
-- Mimohflorist & Gift Shop — Supabase setup
-- Run this once in your Supabase project's SQL Editor
-- (Project → SQL Editor → New query → paste → Run)
-- ============================================================

-- 1. Products table
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  category text not null default 'Flowers',
  image_url text,
  in_stock boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- 2. Row Level Security
alter table products enable row level security;

-- Anyone (including anonymous site visitors) can read products
drop policy if exists "Public can view products" on products;
create policy "Public can view products"
  on products for select
  using (true);

-- Only logged-in (admin) users can add/edit/delete
drop policy if exists "Authenticated can insert products" on products;
create policy "Authenticated can insert products"
  on products for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated can update products" on products;
create policy "Authenticated can update products"
  on products for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated can delete products" on products;
create policy "Authenticated can delete products"
  on products for delete
  to authenticated
  using (true);

-- 3. Storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public can view images
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Only logged-in users can upload/replace/delete images
drop policy if exists "Authenticated can upload product images" on storage.objects;
create policy "Authenticated can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "Authenticated can update product images" on storage.objects;
create policy "Authenticated can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated can delete product images" on storage.objects;
create policy "Authenticated can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');

-- ============================================================
-- 4. Create your admin login
-- ============================================================
-- Go to: Authentication → Users → Add user (in the Supabase dashboard)
-- Create the admin with an email + password. Do NOT use the SQL
-- editor for this step — use the dashboard so the password is
-- hashed correctly. Then log in at admin.html with those credentials.
-- ============================================================
