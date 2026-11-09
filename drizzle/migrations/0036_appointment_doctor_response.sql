-- Reception schedules appointments against a provider. Doctors confirm whether
-- they are available without being able to change anything else.
alter table public.appointments
  add column if not exists doctor_response text not null default 'pending'
    check (doctor_response in ('pending', 'available', 'unavailable')),
  add column if not exists doctor_response_note text,
  add column if not exists doctor_responded_at timestamptz;

create index if not exists appointments_provider_response_idx
  on public.appointments (provider_id, doctor_response);

create or replace function public.respond_to_appointment(
  _appointment_id uuid,
  _response text,
  _note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to appointments.'
      using errcode = '42501';
  end if;

  if _response not in ('available', 'unavailable') then
    raise exception 'Choose whether you are available or not.'
      using errcode = '22023';
  end if;

  update public.appointments appointment
  set doctor_response = _response,
      doctor_response_note = nullif(trim(_note), ''),
      doctor_responded_at = now(),
      updated_at = now()
  where appointment.id = _appointment_id
    and exists (
      select 1
      from public.employees employee
      where employee.id = appointment.provider_id
        and employee.user_id = auth.uid()
    );

  if not found then
    raise exception 'That appointment is not assigned to you.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.respond_to_appointment(uuid, text, text) from public, anon;
grant execute on function public.respond_to_appointment(uuid, text, text) to authenticated;
