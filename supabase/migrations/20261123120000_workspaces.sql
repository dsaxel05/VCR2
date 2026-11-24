-- VCR2 workspaces (Deal flow): a team's settings and its company index.
-- Isolation is enforced HERE, by row-level security: a signed-in user sees a workspace, its members and its companies only
-- while they are a member of it; only its admins change its settings, members and invitations; anonymous visitors see nothing.
-- Stored: settings (thesis, scorecard, pipeline, sheet mapping, memo template) and, per company, the structured record
-- (facts with short quotes, scores, statuses, notes). Never the decks, their text or the customer ledger: those stay in the
-- investor's own Drive.

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 262144),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     int not null default 1 check (version >= 1)
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text check (char_length(email) <= 254),
  role         text not null check (role in ('admin', 'member')),
  added_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create table public.workspace_invites (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (email ~* '^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$'),
  role         text not null default 'member' check (role in ('admin', 'member')),
  invited_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, email)
);
create table public.ws_companies (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null check (id ~ '^[A-Za-z0-9_-]{6,64}$'),
  payload      jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 409600),
  status       text check (char_length(status) <= 60),
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid() references auth.users (id) on delete set null,
  version      int not null default 1 check (version >= 1),
  primary key (workspace_id, id)
);
create index ws_companies_ws on public.ws_companies (workspace_id, updated_at desc);

-- The caller's role in a workspace, or null. Security definer so policies can read memberships without recursion.
create or replace function public.ws_role(w uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m where m.workspace_id = w and m.user_id = auth.uid()
$$;

-- The creator of a workspace becomes its first admin.
create or replace function public.ws_after_create() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members (workspace_id, user_id, email, role)
  values (new.id, new.created_by, (select u.email from auth.users u where u.id = new.created_by), 'admin');
  return new;
end $$;
create trigger ws_after_create after insert on public.workspaces for each row execute function public.ws_after_create();

-- Every write moves the version on by exactly one (no silent overwrite between two team members), and stamps the time.
create or replace function public.ws_bump() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then raise exception 'version_conflict' using errcode = 'P0001'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger ws_bump_ws before update on public.workspaces for each row execute function public.ws_bump();
create trigger ws_bump_co before insert or update on public.ws_companies for each row execute function public.ws_bump();

-- Limits: 20 workspaces created per person, 50 members and 10,000 companies per workspace.
create or replace function public.ws_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'workspaces' and (select count(*) from public.workspaces w where w.created_by = new.created_by) >= 20 then raise exception 'quota_workspaces' using errcode = 'P0001'; end if;
  if tg_table_name = 'workspace_members' and (select count(*) from public.workspace_members m where m.workspace_id = new.workspace_id) >= 50 then raise exception 'quota_members' using errcode = 'P0001'; end if;
  if tg_table_name = 'ws_companies' and (select count(*) from public.ws_companies c where c.workspace_id = new.workspace_id) >= 10000 then raise exception 'quota_companies' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger ws_limit_ws before insert on public.workspaces for each row execute function public.ws_limits();
create trigger ws_limit_mem before insert on public.workspace_members for each row execute function public.ws_limits();
create trigger ws_limit_co before insert on public.ws_companies for each row execute function public.ws_limits();

-- Joining: an invitation to the caller's own (confirmed) e-mail address becomes a membership.
create or replace function public.ws_accept_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; e text;
begin
  select lower(u.email) into e from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if e is null then return 0; end if;
  insert into public.workspace_members (workspace_id, user_id, email, role)
    select i.workspace_id, auth.uid(), e, i.role from public.workspace_invites i where lower(i.email) = e
    on conflict (workspace_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.workspace_invites i where lower(i.email) = e;
  return n;
end $$;

-- A workspace never loses its last admin.
create or replace function public.ws_keep_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and (select count(*) from public.workspace_members m where m.workspace_id = old.workspace_id and m.role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger ws_keep_admin before update or delete on public.workspace_members for each row execute function public.ws_keep_admin();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.ws_companies enable row level security;

revoke all on public.workspaces, public.workspace_members, public.workspace_invites, public.ws_companies from anon, authenticated, public;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, update, delete on public.workspace_members to authenticated;
grant select, insert, delete on public.workspace_invites to authenticated;
grant select, insert, update, delete on public.ws_companies to authenticated;

create policy ws_read on public.workspaces for select to authenticated using (public.ws_role(id) is not null);
create policy ws_create on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy ws_admin_update on public.workspaces for update to authenticated using (public.ws_role(id) = 'admin') with check (public.ws_role(id) = 'admin');
create policy ws_admin_delete on public.workspaces for delete to authenticated using (public.ws_role(id) = 'admin');

create policy mem_read on public.workspace_members for select to authenticated using (public.ws_role(workspace_id) is not null);
create policy mem_admin_update on public.workspace_members for update to authenticated using (public.ws_role(workspace_id) = 'admin') with check (public.ws_role(workspace_id) = 'admin');
create policy mem_leave_or_remove on public.workspace_members for delete to authenticated using (public.ws_role(workspace_id) = 'admin' or user_id = auth.uid());

create policy inv_read on public.workspace_invites for select to authenticated using (public.ws_role(workspace_id) = 'admin');
create policy inv_admin_add on public.workspace_invites for insert to authenticated with check (public.ws_role(workspace_id) = 'admin' and invited_by = auth.uid());
create policy inv_admin_delete on public.workspace_invites for delete to authenticated using (public.ws_role(workspace_id) = 'admin');

create policy co_member on public.ws_companies for all to authenticated
  using (public.ws_role(workspace_id) is not null) with check (public.ws_role(workspace_id) is not null);

revoke all on function public.ws_role(uuid), public.ws_accept_invites(), public.ws_after_create(), public.ws_bump(), public.ws_limits(), public.ws_keep_admin() from public, anon;
grant execute on function public.ws_role(uuid), public.ws_accept_invites() to authenticated;
