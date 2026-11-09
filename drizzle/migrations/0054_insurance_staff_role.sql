-- Insurance companies sign in through the same staff flow and are approved by a
-- hospital administrator. The enum value is added on its own so the following
-- migration can use it.
alter type public.staff_role add value if not exists 'insurance';
