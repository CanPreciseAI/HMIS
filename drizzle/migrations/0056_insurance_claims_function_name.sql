-- The claims ledger function was created with a longer name than the app calls.
-- Rename it in place so grants and the return shape stay untouched.
alter function public.facility_insurance_policy_claims(uuid)
  rename to facility_insurance_claims;
