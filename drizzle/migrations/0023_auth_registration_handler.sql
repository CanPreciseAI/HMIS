-- Route newly created auth users through the HMIS profile and approval logic.
-- The public-user trigger is retained for the shared users identity row.
drop trigger if exists on_staff_created on auth.users;
drop trigger if exists on_staff_auth_user_created on auth.users;

create trigger on_staff_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_staff();
