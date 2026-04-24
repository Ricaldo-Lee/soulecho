-- 阿里云短信 + 自定义 OTP：验证码表 + 按手机号查找 auth.users（仅 service_role 可调）
create table if not exists public.phone_auth_challenges (
  phone_e164 text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.phone_auth_challenges enable row level security;

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
