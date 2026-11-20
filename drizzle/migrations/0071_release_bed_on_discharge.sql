-- When a patient is discharged, their room must become available again for
-- every actor and every screen that can discharge (ward board, patient flow,
-- future tools). Enforce it in the database instead of relying on each client
-- to close the assignment and clear the bed flag.

-- Recompute a bed's occupied flag from its active assignments.
create or replace function public.refresh_bed_occupancy(_bed_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.beds bed
  set is_occupied = exists (
        select 1
        from public.bed_assignments assignment
        where assignment.bed_id = bed.id
          and assignment.status = 'active'
      ),
      updated_at = now()
  where bed.id = _bed_id;
end;
$$;

revoke all on function public.refresh_bed_occupancy(uuid) from public, anon;

-- Keep beds.is_occupied in step with bed_assignments inserts/updates/deletes.
create or replace function public.sync_bed_occupancy_after_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_bed_occupancy(new.bed_id);
  end if;
  if tg_op = 'DELETE' then
    perform public.refresh_bed_occupancy(old.bed_id);
  elsif tg_op = 'UPDATE' and new.bed_id <> old.bed_id then
    perform public.refresh_bed_occupancy(old.bed_id);
  end if;
  return null;
end;
$$;

drop trigger if exists sync_bed_occupancy on public.bed_assignments;
create trigger sync_bed_occupancy
  after insert or update or delete on public.bed_assignments
  for each row execute function public.sync_bed_occupancy_after_assignment();

-- Discharging an admission closes its active bed assignment(s), which in turn
-- clears the bed's occupied flag.
create or replace function public.release_ward_bed_on_discharge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'discharged' and old.status is distinct from 'discharged' then
    update public.bed_assignments
    set status = 'ended',
        end_at = coalesce(new.discharged_at, now()),
        updated_at = now()
    where admission_id = new.id
      and status = 'active';

    perform public.refresh_bed_occupancy(bed.bed_id)
    from (
      select distinct assignment.bed_id
      from public.bed_assignments assignment
      where assignment.admission_id = new.id
    ) as bed;
  end if;
  return null;
end;
$$;

drop trigger if exists release_ward_bed_on_discharge on public.admissions;
create trigger release_ward_bed_on_discharge
  after update of status, discharged_at on public.admissions
  for each row execute function public.release_ward_bed_on_discharge();

-- Repair any rooms left marked occupied without an active assignment.
update public.beds bed
set is_occupied = false,
    updated_at = now()
where bed.is_occupied
  and not exists (
    select 1
    from public.bed_assignments assignment
    where assignment.bed_id = bed.id
      and assignment.status = 'active'
  );
