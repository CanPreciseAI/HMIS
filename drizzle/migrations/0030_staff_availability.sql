-- Staff-set availability.
--
-- Availability is chosen by the staff member from their own workspace, so the
-- hospital administrator can only display it. A security-definer function
-- limits staff to updating this one column on their own employee record.

alter table public.employees
  add column if not exists availability text not null default 'available'
  constraint employees_availability_check
  check (availability in ('available', 'busy', 'on_leave', 'off_duty'));

create or replace function public.set_my_availability(_availability text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to update your availability'
      using errcode = '42501';
  end if;

  if _availability not in ('available', 'busy', 'on_leave', 'off_duty') then
    raise exception 'Unknown availability value'
      using errcode = '22023';
  end if;

  update public.employees
    set availability = _availability
    where user_id = auth.uid();

  if not found then
    raise exception 'No employee record is linked to this account'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_my_availability(text) from public, anon;
grant execute on function public.set_my_availability(text) to authenticated;
