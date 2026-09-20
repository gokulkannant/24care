create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'patient' check (role in ('patient', 'caretaker', 'clinician', 'care_coordinator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.caretaker_patient (
  caretaker_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (caretaker_id, patient_id),
  check (caretaker_id <> patient_id)
);

create table if not exists public.care_case (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  initiated_by uuid not null references public.profiles(id),
  case_alias text not null,
  caller_relationship text not null,
  callback_reference text not null,
  policy_version text not null,
  priority text not null default 'insufficient_information' check (priority in ('immediate_clinician_review', 'urgent_review', 'same_day_queue', 'routine_queue', 'insufficient_information')),
  status text not null default 'review' check (status in ('open', 'review', 'confirmed', 'overridden', 'closed')),
  triage_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consent_record (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.care_case(id) on delete cascade,
  captured_by uuid not null references public.profiles(id),
  intake_consent boolean not null default false,
  recording_consent boolean not null default false,
  notice_version text not null,
  captured_at timestamptz not null default now()
);

create table if not exists public.transcript_segment (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.care_case(id) on delete cascade,
  provider_item_id text,
  speaker text not null default 'caller' check (speaker in ('caller', 'assistant', 'clinician', 'system')),
  transcript text not null,
  language text not null default 'mixed' check (language in ('ml', 'en', 'mixed')),
  status text not null default 'final' check (status in ('partial', 'final')),
  captured_at timestamptz not null default now()
);

create table if not exists public.assessment (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.care_case(id) on delete cascade,
  provider text not null,
  policy_version text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clinical_decision (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.care_case(id) on delete cascade,
  clinician_id uuid not null references public.profiles(id),
  outcome text not null check (outcome in ('confirmed', 'overridden')),
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_task (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.care_case(id) on delete cascade,
  priority text not null check (priority in ('immediate_clinician_review', 'urgent_review', 'same_day_queue', 'routine_queue', 'insufficient_information')),
  action text not null,
  assignee_id uuid references public.profiles(id),
  state text not null check (state in ('draft', 'awaiting_clinician', 'assigned', 'unassigned_urgent')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.care_case(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists care_case_patient_id_idx on public.care_case(patient_id);
create index if not exists care_case_status_priority_idx on public.care_case(status, priority);
create index if not exists transcript_segment_case_id_idx on public.transcript_segment(case_id, captured_at);
create index if not exists care_task_state_priority_idx on public.care_task(state, priority);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'new user'), '@', 1)),
    'patient'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.app_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_review_cases()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.app_role() in ('clinician', 'care_coordinator', 'admin'), false);
$$;

create or replace function public.can_access_case(target_case_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.care_case c
    where c.id = target_case_id
      and (
        public.can_review_cases()
        or c.patient_id = auth.uid()
        or c.initiated_by = auth.uid()
        or exists (
          select 1
          from public.caretaker_patient cp
          where cp.patient_id = c.patient_id
            and cp.caretaker_id = auth.uid()
            and cp.status = 'active'
        )
      )
  );
$$;

revoke all on function public.app_role() from public;
revoke all on function public.can_review_cases() from public;
revoke all on function public.can_access_case(uuid) from public;
grant execute on function public.app_role() to authenticated;
grant execute on function public.can_review_cases() to authenticated;
grant execute on function public.can_access_case(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'caretaker_patient', 'care_case', 'consent_record', 'transcript_segment', 'assessment', 'clinical_decision', 'care_task', 'audit_event'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end;
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.can_review_cases());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists caretaker_patient_select on public.caretaker_patient;
create policy caretaker_patient_select on public.caretaker_patient
for select to authenticated
using (caretaker_id = auth.uid() or patient_id = auth.uid() or public.can_review_cases());

drop policy if exists caretaker_patient_write on public.caretaker_patient;
create policy caretaker_patient_write on public.caretaker_patient
for insert to authenticated
with check (public.can_review_cases());

 drop policy if exists care_case_select on public.care_case;
create policy care_case_select on public.care_case
for select to authenticated
using (public.can_access_case(id));

drop policy if exists care_case_insert on public.care_case;
create policy care_case_insert on public.care_case
for insert to authenticated
with check (
  initiated_by = auth.uid()
  and (
    patient_id = auth.uid()
    or public.can_review_cases()
    or exists (
      select 1 from public.caretaker_patient cp
      where cp.patient_id = care_case.patient_id
        and cp.caretaker_id = auth.uid()
        and cp.status = 'active'
    )
  )
);

drop policy if exists care_case_update on public.care_case;
create policy care_case_update on public.care_case
for update to authenticated
using (public.can_review_cases())
with check (public.can_review_cases());

drop policy if exists consent_record_access on public.consent_record;
create policy consent_record_access on public.consent_record
for all to authenticated
using (public.can_access_case(case_id))
with check (public.can_access_case(case_id) and captured_by = auth.uid());

drop policy if exists transcript_segment_access on public.transcript_segment;
create policy transcript_segment_access on public.transcript_segment
for all to authenticated
using (public.can_access_case(case_id))
with check (public.can_access_case(case_id));

drop policy if exists assessment_access on public.assessment;
create policy assessment_access on public.assessment
for all to authenticated
using (public.can_access_case(case_id))
with check (public.can_access_case(case_id));

drop policy if exists clinical_decision_access on public.clinical_decision;
create policy clinical_decision_access on public.clinical_decision
for all to authenticated
using (public.can_review_cases() and public.can_access_case(case_id))
with check (public.can_review_cases() and public.can_access_case(case_id) and clinician_id = auth.uid());

drop policy if exists care_task_access on public.care_task;
create policy care_task_access on public.care_task
for all to authenticated
using (public.can_review_cases() or public.can_access_case(case_id))
with check (public.can_review_cases() and public.can_access_case(case_id));

drop policy if exists audit_event_access on public.audit_event;
create policy audit_event_access on public.audit_event
for all to authenticated
using (case_id is null and actor_id = auth.uid() or (case_id is not null and public.can_access_case(case_id)))
with check (actor_id = auth.uid() and (case_id is null or public.can_access_case(case_id)));
