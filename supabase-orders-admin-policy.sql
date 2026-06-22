-- Allow authenticated admin to read ALL orders
-- Run this in Supabase SQL Editor

drop policy if exists "Authenticated admin can view all orders" on public.orders;

create policy "Authenticated admin can view all orders"
  on public.orders for select
  using (auth.role() = 'authenticated');

-- Also allow admin to read all customer profiles
drop policy if exists "Authenticated admin can view all profiles" on public.customer_profiles;

create policy "Authenticated admin can view all profiles"
  on public.customer_profiles for select
  using (auth.role() = 'authenticated');
