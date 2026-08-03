alter table public.profiles
  add column if not exists real_name text,
  add column if not exists id_card_number text,
  add column if not exists real_name_submitted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_real_name_length_check,
  add constraint profiles_real_name_length_check
    check (real_name is null or char_length(btrim(real_name)) between 2 and 40),
  drop constraint if exists profiles_id_card_number_format_check,
  add constraint profiles_id_card_number_format_check
    check (id_card_number is null or id_card_number ~ '^[0-9]{17}[0-9X]$');

comment on column public.profiles.real_name is 'User submitted legal name for real-name registration.';
comment on column public.profiles.id_card_number is 'User submitted PRC resident identity card number. Treat as sensitive personal data.';
comment on column public.profiles.real_name_submitted_at is 'Timestamp of latest real-name information submission.';
