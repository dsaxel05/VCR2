-- VCR2 accounts (Part B, rules A3, A7, A8, A9, A11).
-- Per-user isolation is enforced HERE, by row-level security, never only in the page.
-- Every record has an owner; a signed-in user reads and writes only their own rows;
-- anonymous visitors (the public "anon" key) have no access to anything.

-- ── Limits the project owner can change (SQL editor, or the snippet the Studio writes) ──
create table public.app_limits (
  id               boolean primary key default true check (id),   -- exactly one row
  max_analyses     int     not null default 100     check (max_analyses between 1 and 100000),
  max_bytes        bigint  not null default 5242880 check (max_bytes between 1024 and 10737418240),   -- 5 MB per user
  max_record_bytes int     not null default 1048576 check (max_record_bytes between 1024 and 52428800), -- 1 MB per analysis
  max_versions     int     not null default 20      check (max_versions between 1 and 200)
);
insert into public.app_limits default values;

-- People allowed to read the aggregate usage summary (counts only) from the Studio.
-- Filled by the project owner in the Supabase dashboard; no policy, so no one can write it through the API.
create table public.app_admins (user_id uuid primary key references auth.users (id) on delete cascade);

-- ── What may be stored for an analysis (A3) ──
-- Top-level keys of the structured analysis state. Anything else (raw documents, extracted text,
-- AI keys, the customer-level ledger) is refused by the database itself.
create or replace function public.vcr2_payload_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('v','name','stage','model','asof','section','vals','bools','sel','prov','evid','assume',
                      'notes','checklist','evidFile','requests','series','ledger','ledgerStats','score'))
    -- the customer-level ledger never leaves the device in clear: only null is accepted
    and (not (p ? 'ledger') or jsonb_typeof(p -> 'ledger') = 'null')
  );
$$;

-- Comparables: metric rows only. A saved full assessment ("payload") belongs in analyses, not here.
create or replace function public.vcr2_comparables_ok(c jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'array' and jsonb_array_length(c) <= 1000
     and not exists (select 1 from jsonb_array_elements(c) e where jsonb_typeof(e) <> 'object' or e ? 'payload');
$$;

-- ── Tables ──
create table public.analyses (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  company     text check (char_length(company) <= 200),
  stage       text check (stage ~ '^[a-z][a-z0-9_]{0,23}$'),
  model       text check (model ~ '^[a-z][a-z0-9_]{0,39}$'),
  score       numeric check (score between 0 and 100),
  band        text check (char_length(band) <= 40),
  tags        text[] not null default '{}' check (cardinality(tags) <= 20),
  folder      text check (char_length(folder) <= 80),
  archived    boolean not null default false,
  vault       boolean not null default false,
  payload     jsonb,
  cipher      text check (cipher ~ '^[A-Za-z0-9+/=._-]*$'),   -- Vault mode: base64 ciphertext only
  app_version text check (char_length(app_version) <= 20),
  version     int  not null default 1 check (version >= 1),
  bytes       int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint analyses_vault_shape check ((vault and payload is null and cipher is not null)
                                      or (not vault and cipher is null and payload is not null)),
  constraint analyses_payload_ok check (public.vcr2_payload_ok(payload))
);
create index analyses_owner_idx on public.analyses (owner, updated_at desc);

create table public.analysis_versions (
  id          bigint generated always as identity primary key,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version     int  not null check (version >= 1),
  label       text check (char_length(label) <= 80),
  score       numeric check (score between 0 and 100),
  vault       boolean not null default false,
  payload     jsonb,
  cipher      text check (cipher ~ '^[A-Za-z0-9+/=._-]*$'),
  bytes       int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (analysis_id, version),
  constraint versions_vault_shape check ((vault and payload is null and cipher is not null)
                                      or (not vault and cipher is null and payload is not null)),
  constraint versions_payload_ok check (public.vcr2_payload_ok(payload))
);
create index analysis_versions_owner_idx on public.analysis_versions (owner, analysis_id, version desc);

-- One row per user: preferences, comparables library, terms acceptance (A8, A12).
create table public.profiles (
  owner             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prefs             jsonb not null default '{}' check (jsonb_typeof(prefs) = 'object' and octet_length(prefs::text) <= 16384),
  comparables       jsonb not null default '[]' check (public.vcr2_comparables_ok(comparables)),
  terms_accepted_at timestamptz,
  version           int not null default 1 check (version >= 1),
  bytes             int not null default 0,
  updated_at        timestamptz not null default now()
);

-- ── Guards: sizes, quotas, immutable fields, version counter ──
create or replace function public.vcr2_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim public.app_limits%rowtype;
  used bigint; n int;
begin
  -- Before-triggers run before the row-level-security check: refuse a forged owner first,
  -- so the quota message below can never reveal another user's usage.
  if auth.uid() is not null and new.owner is distinct from auth.uid() then
    raise exception 'owner_mismatch' using errcode = '42501';
  end if;
  select * into lim from public.app_limits where id;
  if tg_table_name = 'profiles' then
    new.bytes := octet_length(new.prefs::text) + octet_length(new.comparables::text);
  else
    new.bytes := coalesce(octet_length(new.payload::text), 0) + coalesce(octet_length(new.cipher), 0);
    if new.bytes > lim.max_record_bytes then
      raise exception 'record_too_large' using errcode = '54000', detail = new.bytes::text;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.owner is distinct from old.owner then raise exception 'owner_immutable' using errcode = '42501'; end if;
    if tg_table_name = 'analysis_versions' then raise exception 'versions_are_read_only' using errcode = '42501'; end if;
    -- A9: every write must carry the next version number, so a stale device can never overwrite silently.
    if new.version <> old.version + 1 then
      raise exception 'version_conflict' using errcode = '40001', detail = old.version::text;
    end if;
    if tg_table_name = 'analyses' then new.created_at := old.created_at; end if;
  end if;
  if tg_table_name <> 'analysis_versions' then new.updated_at := now(); end if;

  -- Quotas, serialised per user so two parallel writes cannot both slip under the cap.
  -- Each branch names only the columns of its own table (the row being written is left out of "used").
  perform pg_advisory_xact_lock(hashtextextended(new.owner::text, 0));
  if tg_table_name = 'analyses' then
    used := (select coalesce(sum(bytes), 0) from public.analyses where owner = new.owner and id <> new.id)
          + (select coalesce(sum(bytes), 0) from public.analysis_versions where owner = new.owner)
          + (select coalesce(sum(bytes), 0) from public.profiles where owner = new.owner);
  elsif tg_table_name = 'analysis_versions' then
    used := (select coalesce(sum(bytes), 0) from public.analyses where owner = new.owner)
          + (select coalesce(sum(bytes), 0) from public.analysis_versions where owner = new.owner and id <> new.id)
          + (select coalesce(sum(bytes), 0) from public.profiles where owner = new.owner);
  else
    used := (select coalesce(sum(bytes), 0) from public.analyses where owner = new.owner)
          + (select coalesce(sum(bytes), 0) from public.analysis_versions where owner = new.owner);
  end if;
  if used + new.bytes > lim.max_bytes then
    raise exception 'quota_bytes' using errcode = '53400', detail = (used + new.bytes)::text || '/' || lim.max_bytes::text;
  end if;
  if tg_table_name = 'analyses' and tg_op = 'INSERT' then
    select count(*) into n from public.analyses where owner = new.owner;
    if n >= lim.max_analyses then
      raise exception 'quota_analyses' using errcode = '53400', detail = n::text || '/' || lim.max_analyses::text;
    end if;
  end if;
  return new;
end $$;

create trigger analyses_guard before insert or update on public.analyses          for each row execute function public.vcr2_guard();
create trigger versions_guard before insert or update on public.analysis_versions for each row execute function public.vcr2_guard();
create trigger profiles_guard before insert or update on public.profiles          for each row execute function public.vcr2_guard();

-- Keep only the last max_versions versions of each analysis.
create or replace function public.vcr2_trim_versions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.analysis_versions v
   where v.analysis_id = new.analysis_id
     and v.id not in (select id from public.analysis_versions
                       where analysis_id = new.analysis_id
                       order by version desc
                       limit (select max_versions from public.app_limits where id));
  return null;
end $$;
create trigger versions_trim after insert on public.analysis_versions for each row execute function public.vcr2_trim_versions();

-- ── Row-level security (A7) ──
alter table public.analyses          enable row level security;
alter table public.analysis_versions enable row level security;
alter table public.profiles          enable row level security;
alter table public.app_limits        enable row level security;
alter table public.app_admins        enable row level security;
alter table public.analyses          force row level security;
alter table public.analysis_versions force row level security;
alter table public.profiles          force row level security;

-- Supabase grants every privilege to anon and authenticated by default: take them all back, then grant only what is needed.
revoke all on public.analyses, public.analysis_versions, public.profiles, public.app_limits, public.app_admins from anon, authenticated, public;
grant select, insert, update, delete on public.analyses to authenticated;
grant select, insert, delete         on public.analysis_versions to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select                         on public.app_limits to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy analyses_own on public.analyses for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy versions_own_read on public.analysis_versions for select to authenticated
  using (owner = (select auth.uid()));
create policy versions_own_delete on public.analysis_versions for delete to authenticated
  using (owner = (select auth.uid()));
-- A version can only be attached to an analysis the same user owns.
create policy versions_own_insert on public.analysis_versions for insert to authenticated
  with check (owner = (select auth.uid())
              and exists (select 1 from public.analyses a where a.id = analysis_id and a.owner = (select auth.uid())));

create policy profiles_own on public.profiles for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy limits_read on public.app_limits for select to authenticated using (true);

-- ── Functions the page calls ──
-- Usage of the signed-in user, for the quota meter.
create or replace function public.my_usage() returns json
language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'analyses', (select count(*) from public.analyses where owner = auth.uid()),
    'bytes',    (select coalesce(sum(bytes), 0) from (
                   select bytes from public.analyses where owner = auth.uid()
                   union all select bytes from public.analysis_versions where owner = auth.uid()
                   union all select bytes from public.profiles where owner = auth.uid()) t),
    'max_analyses', (select max_analyses from public.app_limits where id),
    'max_bytes',    (select max_bytes from public.app_limits where id));
$$;

-- A11: "Delete my account and all my data". Removes the sign-in record; every table cascades from it.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Studio: aggregate counts only, never content, and only for the project owner's listed accounts.
create or replace function public.usage_summary() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return json_build_object(
    'accounts', (select count(*) from auth.users),
    'analyses', (select count(*) from public.analyses),
    'bytes',    (select coalesce(sum(bytes), 0) from public.analyses) + (select coalesce(sum(bytes), 0) from public.analysis_versions));
end $$;

revoke all on function public.my_usage(), public.delete_my_account(), public.usage_summary(),
                       public.vcr2_guard(), public.vcr2_trim_versions() from public, anon;
grant execute on function public.my_usage(), public.delete_my_account(), public.usage_summary() to authenticated;
