-- The sample medicine catalog and sample wards were convenience seeders that
-- wrote made-up rows into a hospital's own tables. They are removed so nothing
-- in the app can add sample data again; every dashboard keeps reading the same
-- live records the staff enter.

drop function if exists public.seed_demo_medicine_catalog(uuid);
drop function if exists public.seed_demo_wards(uuid);
