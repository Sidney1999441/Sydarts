create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin(auth.uid()) then
    new.role = old.role;
    new.rating = old.rating;
    new.skill_level = old.skill_level;
    new.status = old.status;
  end if;
  return new;
end;
$$;
