-- ====================================================
-- Run this if you already ran the accounts migration
-- Only creates promo_codes and blog_posts tables
-- ====================================================

-- Promo codes
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

drop policy if exists "Public can read active promo codes" on public.promo_codes;
drop policy if exists "Authenticated can manage promo codes" on public.promo_codes;

create policy "Public can read active promo codes"
  on public.promo_codes for select
  using (active = true);

create policy "Authenticated can manage promo codes"
  on public.promo_codes for all
  using (auth.role() = 'authenticated');

insert into public.promo_codes (code, type, value, label) values
  ('MIMO10',   'percent', 10,  '10% off'),
  ('MIMO20',   'percent', 20,  '20% off'),
  ('FLOWERS',  'percent', 15,  '15% off'),
  ('BIRTHDAY', 'flat',   200,  'KES 200 off'),
  ('WEDDING',  'flat',   500,  'KES 500 off'),
  ('NAIROBI',  'percent',  5,  '5% off')
on conflict (code) do nothing;

-- Blog posts
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

drop policy if exists "Public can read published posts" on public.blog_posts;
drop policy if exists "Authenticated can manage posts" on public.blog_posts;

create policy "Public can read published posts"
  on public.blog_posts for select
  using (published = true);

create policy "Authenticated can manage posts"
  on public.blog_posts for all
  using (auth.role() = 'authenticated');

insert into public.blog_posts (title, excerpt, category, image_url, link_label, link_href) values
  ('How to Keep Cut Flowers Fresh for 2 Weeks',
   'Simple tricks — from water temperature to stem cutting angles — that double the vase life of your blooms.',
   'Flower Care', 'images/event-birthday.jpg', 'Ask our florist', '#contact'),
  ('2025 Wedding Flower Trends in Nairobi',
   'From tropical lush greens to minimalist white arches — what Nairobi brides are booking this season.',
   'Wedding', 'images/event-wedding.jpg', 'See our packages', '#events'),
  ('What Flowers to Send for Every Occasion',
   'Roses for romance, lilies for sympathy, sunflowers for joy — a quick guide to never getting it wrong.',
   'Gifting', 'images/event-funeral.jpg', 'Shop by occasion', '#shop')
on conflict do nothing;

-- Newsletter (safe re-run)
create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  created_at timestamptz default now()
);
