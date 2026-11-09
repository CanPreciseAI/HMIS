-- Legacy registration wiring created employee rows before approval. Pending
-- staff must not receive tenant membership through those rows.
update public.employees employee
set employment_status = 'terminated',
    updated_at = now()
from public.staff_approval_requests request
where request.user_id = employee.user_id
  and request.tenant_id = employee.tenant_id
  and request.status = 'pending'
  and employee.employment_status <> 'terminated';

create or replace function public.revoke_rejected_staff_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'rejected' then
    update public.employees
    set employment_status = 'terminated',
        updated_at = now()
    where user_id = new.user_id
      and tenant_id = new.tenant_id;

    update public.user_role_assignments
    set valid_until = case
      when valid_from >= now() then valid_from + interval '1 microsecond'
      else now()
    end
    where user_id = new.user_id
      and tenant_id = new.tenant_id
      and (valid_until is null or valid_until > now());
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_rejected_staff_membership()
  from public;

create trigger revoke_rejected_staff_membership
  after update of status on public.staff_approval_requests
  for each row execute function public.revoke_rejected_staff_membership();
