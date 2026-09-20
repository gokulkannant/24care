create table if not exists public.app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  avatar_url text,
  google_subject text unique,
  role text not null default 'patient' check (role in ('patient', 'caretaker', 'clinician', 'care_coordinator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.app_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_user(id) on delete cascade,
  refresh_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists app_session_user_id_idx on public.app_session(user_id, expires_at desc);
create index if not exists app_session_active_idx on public.app_session(user_id, revoked_at, expires_at);

insert into public.app_user (id, email, display_name, role)
select p.id,
       coalesce(nullif(au.email, ''), p.id::text || '@legacy.invalid'),
       p.display_name,
       p.role
from public.profiles p
left join auth.users au on au.id = p.id
on conflict (id) do nothing;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_app_user_fkey foreign key (id) references public.app_user(id) on delete cascade;

alter table public.app_user enable row level security;
alter table public.app_session enable row level security;
revoke all on public.app_user from anon, authenticated;
revoke all on public.app_session from anon, authenticated;
grant all on public.app_user to service_role;
grant all on public.app_session to service_role;
