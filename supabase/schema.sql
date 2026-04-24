-- ============================================================
-- SoulEcho 灵音 — Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up all tables
-- ============================================================

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- ─── user_profiles ────────────────────────────────────────────
-- Stores user birth data and display name
create table if not exists public.user_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email       text,
  phone       text,       -- E.164，如 +8613800138000（与 auth.users.phone 一致便于展示）
  birth_date  text,       -- e.g. "1996-06-15"
  birth_time  text,       -- e.g. "10:00"
  birth_place text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Enable RLS
alter table public.user_profiles enable row level security;

-- Users can only read/write their own profile（可重复执行整份脚本）
drop policy if exists "user_profiles: own access" on public.user_profiles;
create policy "user_profiles: own access" on public.user_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── readings ─────────────────────────────────────────────────
-- Stores chat conversation history (user + spirit messages)
create table if not exists public.readings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'spirit')),
  content     text not null,
  created_at  timestamptz default now()
);

create index if not exists readings_user_id_idx on public.readings(user_id);
create index if not exists readings_created_at_idx on public.readings(created_at);

-- Enable RLS
alter table public.readings enable row level security;

-- Users can only read their own readings
drop policy if exists "readings: own read" on public.readings;
create policy "readings: own read" on public.readings
  for select using (auth.uid() = user_id);

-- Backend service role handles inserts (via service_role key)
-- No direct client insert policy needed since backend handles it

-- ─── guaci_readings ───────────────────────────────────────────
-- Stores I Ching (周易) divination results and AI interpretations
create table if not exists public.guaci_readings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  question        text default '',
  payload         text not null,       -- hexagram data
  interpretation  text not null,       -- AI interpretation text
  created_at      timestamptz default now()
);

create index if not exists guaci_readings_user_id_idx on public.guaci_readings(user_id);
create index if not exists guaci_readings_created_at_idx on public.guaci_readings(created_at);

-- Enable RLS
alter table public.guaci_readings enable row level security;

-- Users can only read their own guaci readings
drop policy if exists "guaci_readings: own read" on public.guaci_readings;
create policy "guaci_readings: own read" on public.guaci_readings
  for select using (auth.uid() = user_id);

-- ─── guaci_pools ──────────────────────────────────────────────
-- Tracks which hexagrams remain in a user's draw pool
create table if not exists public.guaci_pools (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  pool        integer[] not null default '{}',
  updated_at  timestamptz default now()
);

-- Enable RLS
alter table public.guaci_pools enable row level security;

-- Users can read their own pool; backend service role writes
drop policy if exists "guaci_pools: own read" on public.guaci_pools;
create policy "guaci_pools: own read" on public.guaci_pools
  for select using (auth.uid() = user_id);

-- ─── Service role bypass (for backend) ────────────────────────
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- No additional policies needed for backend writes.

-- ─── Helper function: update updated_at automatically ─────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists guaci_pools_updated_at on public.guaci_pools;
create trigger guaci_pools_updated_at
  before update on public.guaci_pools
  for each row execute function public.set_updated_at();

-- ─── 自定义手机 OTP（阿里云短信 + 后端校验，不经 Supabase Phone Provider）──
create table if not exists public.phone_auth_challenges (
  phone_e164 text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.phone_auth_challenges enable row level security;

-- 仅 service_role 可读写（无 policy 时 anon/authenticated 不可访问；service_role 绕过 RLS）

create or replace function public.lookup_auth_user_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = auth
stable
as $$
  select id from auth.users where phone = p_phone limit 1;
$$;

revoke all on function public.lookup_auth_user_by_phone(text) from public;
grant execute on function public.lookup_auth_user_by_phone(text) to service_role;
