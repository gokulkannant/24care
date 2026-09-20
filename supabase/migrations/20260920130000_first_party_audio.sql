create table if not exists public.call_recording (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.care_case(id) on delete set null,
  initiated_by uuid not null references public.profiles(id),
  storage_prefix text not null unique,
  content_type text not null check (content_type in ('audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4')),
  status text not null default 'recording' check (status in ('recording', 'processing', 'ready', 'failed')),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.call_recording_chunk (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.call_recording(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  storage_path text not null unique,
  byte_size integer not null check (byte_size > 0),
  transcript text,
  created_at timestamptz not null default now(),
  unique (recording_id, sequence)
);

create index if not exists call_recording_initiated_by_idx on public.call_recording(initiated_by, created_at desc);
create index if not exists call_recording_case_id_idx on public.call_recording(case_id, created_at desc);
create index if not exists call_recording_chunk_recording_id_idx on public.call_recording_chunk(recording_id, sequence);

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('care-audio', 'care-audio', false)
  on conflict (id) do update set public = false;
exception when undefined_table then
  raise exception 'Supabase Storage is required for the care-audio bucket';
end;
$$;

alter table public.call_recording enable row level security;
alter table public.call_recording_chunk enable row level security;

grant select, insert, update on public.call_recording to authenticated;
grant select, insert on public.call_recording_chunk to authenticated;

drop policy if exists call_recording_select on public.call_recording;
create policy call_recording_select on public.call_recording
for select to authenticated
using (initiated_by = (select auth.uid()) or private.can_review_cases());

drop policy if exists call_recording_insert on public.call_recording;
create policy call_recording_insert on public.call_recording
for insert to authenticated
with check (
  initiated_by = (select auth.uid())
  and (case_id is null or private.can_access_case(case_id))
);

drop policy if exists call_recording_update on public.call_recording;
create policy call_recording_update on public.call_recording
for update to authenticated
using (initiated_by = (select auth.uid()) or private.can_review_cases())
with check (initiated_by = (select auth.uid()) or private.can_review_cases());

drop policy if exists call_recording_chunk_select on public.call_recording_chunk;
create policy call_recording_chunk_select on public.call_recording_chunk
for select to authenticated
using (exists (
  select 1 from public.call_recording r
  where r.id = recording_id
    and (r.initiated_by = (select auth.uid()) or private.can_review_cases())
));

drop policy if exists call_recording_chunk_insert on public.call_recording_chunk;
create policy call_recording_chunk_insert on public.call_recording_chunk
for insert to authenticated
with check (exists (
  select 1 from public.call_recording r
  where r.id = recording_id
    and (r.initiated_by = (select auth.uid()) or private.can_review_cases())
));

drop policy if exists care_audio_insert on storage.objects;
create policy care_audio_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'care-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists care_audio_select on storage.objects;
create policy care_audio_select on storage.objects
for select to authenticated
using (
  bucket_id = 'care-audio'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.can_review_cases()
  )
);
