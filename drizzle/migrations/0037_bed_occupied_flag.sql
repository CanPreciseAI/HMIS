-- Beds normally inherit occupancy from an active bed assignment. Staff can also
-- mark a bed as occupied manually (for example when the patient is admitted on
-- paper before the assignment is entered).
alter table public.beds
  add column if not exists is_occupied boolean not null default false;

create index if not exists beds_occupied_idx
  on public.beds (facility_id)
  where is_occupied;
