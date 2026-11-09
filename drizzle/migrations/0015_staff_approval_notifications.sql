-- Deliver new staff approval requests to connected administrator sessions.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_approval_requests'
  ) then
    if not exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
      raise exception 'Supabase Realtime publication is not configured';
    end if;

    execute 'alter publication supabase_realtime add table public.staff_approval_requests';
  end if;
end;
$$;
