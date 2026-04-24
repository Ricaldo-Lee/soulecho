-- 若表已存在，补充可选资料列（在 Supabase SQL Editor 执行一次即可）
alter table public.user_profiles
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists phone text;
