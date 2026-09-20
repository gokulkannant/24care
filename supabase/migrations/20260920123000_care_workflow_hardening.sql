create schema if not exists private;

alter function public.app_role() set schema private;
alter function public.can_review_cases() set schema private;
alter function public.can_access_case(uuid) set schema private;
alter function public.handle_new_user() set schema private;

revoke all on function private.app_role() from public;
revoke all on function private.can_review_cases() from public;
revoke all on function private.can_access_case(uuid) from public;
revoke all on function private.handle_new_user() from public;
grant usage on schema private to authenticated;
grant execute on function private.app_role() to authenticated;
grant execute on function private.can_review_cases() to authenticated;
grant execute on function private.can_access_case(uuid) to authenticated;

do $$
begin
  execute 'create index if not exists caretaker_patient_patient_id_idx on public.caretaker_patient(patient_id)';
  execute 'create index if not exists care_case_initiated_by_idx on public.care_case(initiated_by)';
  execute 'create index if not exists consent_record_case_id_idx on public.consent_record(case_id)';
  execute 'create index if not exists consent_record_captured_by_idx on public.consent_record(captured_by)';
  execute 'create index if not exists assessment_case_id_idx on public.assessment(case_id)';
  execute 'create index if not exists clinical_decision_case_id_idx on public.clinical_decision(case_id)';
  execute 'create index if not exists clinical_decision_clinician_id_idx on public.clinical_decision(clinician_id)';
  execute 'create index if not exists care_task_case_id_idx on public.care_task(case_id)';
  execute 'create index if not exists care_task_assignee_id_idx on public.care_task(assignee_id)';
  execute 'create index if not exists audit_event_case_id_idx on public.audit_event(case_id)';
  execute 'create index if not exists audit_event_actor_id_idx on public.audit_event(actor_id)';
end;
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.can_review_cases());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and role = (select private.app_role()));

drop policy if exists caretaker_patient_select on public.caretaker_patient;
create policy caretaker_patient_select on public.caretaker_patient
for select to authenticated
using (caretaker_id = (select auth.uid()) or patient_id = (select auth.uid()) or private.can_review_cases());

drop policy if exists caretaker_patient_write on public.caretaker_patient;
create policy caretaker_patient_write on public.caretaker_patient
for insert to authenticated
with check (private.can_review_cases());

drop policy if exists care_case_select on public.care_case;
create policy care_case_select on public.care_case
for select to authenticated
using (private.can_access_case(id));

drop policy if exists care_case_insert on public.care_case;
create policy care_case_insert on public.care_case
for insert to authenticated
with check (
  initiated_by = (select auth.uid())
  and (
    patient_id = (select auth.uid())
    or private.can_review_cases()
    or exists (
      select 1 from public.caretaker_patient cp
      where cp.patient_id = care_case.patient_id
        and cp.caretaker_id = (select auth.uid())
        and cp.status = 'active'
    )
  )
);

drop policy if exists care_case_update on public.care_case;
create policy care_case_update on public.care_case
for update to authenticated
using (private.can_review_cases())
with check (private.can_review_cases());

drop policy if exists consent_record_access on public.consent_record;
create policy consent_record_access on public.consent_record
for all to authenticated
using (private.can_access_case(case_id))
with check (private.can_access_case(case_id) and captured_by = (select auth.uid()));

drop policy if exists transcript_segment_access on public.transcript_segment;
create policy transcript_segment_access on public.transcript_segment
for all to authenticated
using (private.can_access_case(case_id))
with check (private.can_access_case(case_id));

drop policy if exists assessment_access on public.assessment;
create policy assessment_access on public.assessment
for all to authenticated
using (private.can_access_case(case_id))
with check (private.can_access_case(case_id));

drop policy if exists clinical_decision_access on public.clinical_decision;
create policy clinical_decision_access on public.clinical_decision
for all to authenticated
using (private.can_review_cases() and private.can_access_case(case_id))
with check (private.can_review_cases() and private.can_access_case(case_id) and clinician_id = (select auth.uid()));

drop policy if exists care_task_access on public.care_task;
create policy care_task_access on public.care_task
for all to authenticated
using (private.can_review_cases() or private.can_access_case(case_id))
with check (private.can_review_cases() and private.can_access_case(case_id));

drop policy if exists audit_event_access on public.audit_event;
create policy audit_event_access on public.audit_event
for all to authenticated
using ((case_id is null and actor_id = (select auth.uid())) or (case_id is not null and private.can_access_case(case_id)))
with check (actor_id = (select auth.uid()) and (case_id is null or private.can_access_case(case_id)));
