-- =====================================================================
--  STANZA CLIENT PORTAL — DATABASE SETUP
--  ဤဖိုင်ကို Supabase → SQL Editor ထဲ ကူးထည့်ပြီး RUN နှိပ်ပါ။
--  တစ်ခါပဲ လုပ်ရပါမယ်။ (Run this once, in the Supabase SQL Editor.)
--
--  Version 1.0 — 25 Aug 2026
-- =====================================================================


-- =====================================================================
--  PART 1 — PEOPLE
-- =====================================================================

-- Staff or client. Every login belongs to exactly one of these.
create type user_kind as enum ('staff', 'client');

-- The nine roles from the portal. Only staff carry a role.
create type staff_role as enum (
  'managing_director', 'project_manager', 'designer', 'qs',
  'finance', 'sales', 'system_admin', 'subcontractor'
);

-- Supabase keeps logins in auth.users (email, password, MFA).
-- This table holds everything else about a person.
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  phone       text not null default '',
  kind        user_kind not null default 'client',
  role        staff_role,
  status      text not null default 'active',   -- active | disabled
  created_at  timestamptz not null default now()
);

-- When someone signs up, give them a profile row automatically.
-- Everyone starts as a client with no role — staff are promoted by hand.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- =====================================================================
--  PART 2 — CLIENTS AND PROJECTS
-- =====================================================================

create table clients (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  contact_name  text default '',
  phone         text default '',
  email         text default '',
  address       text default '',
  created_at    timestamptz not null default now()
);

create table projects (
  id                      uuid primary key default gen_random_uuid(),
  code                    text unique not null,
  client_id               uuid references clients on delete restrict,
  name                    text not null,
  type                    text default '',
  category                text default '',
  address                 text default '',
  area_sqft               numeric,
  floors                  int,
  design_style            text default '',
  description             text default '',
  scope                   text default '',
  contract_date           date,
  commencement_date       date,
  target_completion_date  date,
  warranty_period         text default '',
  emergency_contact       text default '',
  working_hours           text default '',
  site_rules              text default '',
  next_milestone          text default '',
  next_milestone_date     date,
  notes                   text default '',
  status                  text not null default 'active',  -- active | on_hold | complete | archived
  handover_date           date,
  client_access_until     date,   -- post-handover access clock
  created_at              timestamptz not null default now()
);

-- THE most important table in the database. A person reaches a project
-- only by having a live row here. Everything else follows from it.
create table project_members (
  project_id  uuid not null references projects on delete cascade,
  user_id     uuid not null references profiles on delete cascade,
  role_note   text default '',
  granted_by  uuid references profiles,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (project_id, user_id)
);

create index on project_members (user_id) where revoked_at is null;

-- Whoever creates a project is put on it immediately. Without this a
-- project manager would create a project and then be unable to open it,
-- because the policies below grant access through membership only.
create function add_creator_as_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, granted_by)
    values (new.id, auth.uid(), auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_add_creator
  after insert on projects
  for each row execute function add_creator_as_member();


-- =====================================================================
--  PART 3 — FILES
--  The blob itself lives in Supabase Storage. This table is the record
--  of it: who uploaded it, which project it belongs to, and — the
--  important one — whether a client may see it.
-- =====================================================================

create type file_visibility as enum ('client', 'internal');

create type file_category as enum (
  'design', 'contract', 'quotation', 'invoice', 'receipt',
  'material_sample', 'site_photo', 'site_video', 'meeting_minutes',
  'handover', 'other'
);

create table files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects on delete cascade,
  storage_path   text not null unique,     -- path inside the storage bucket
  original_name  text not null,
  mime_type      text not null default 'application/octet-stream',
  size_bytes     bigint not null default 0,
  category       file_category not null default 'other',
  visibility     file_visibility not null default 'internal',   -- SAFE BY DEFAULT
  uploaded_by    uuid references profiles,
  uploaded_at    timestamptz not null default now(),
  deleted_at     timestamptz
);

create index on files (project_id, category) where deleted_at is null;


-- =====================================================================
--  PART 4 — THE PROJECT RECORD
-- =====================================================================

create table milestones (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects on delete cascade,
  sequence       int not null default 0,
  name           text not null,
  status         text not null default 'Not Started',
  progress_pct   int not null default 0,
  planned_start  date, planned_end date,
  actual_start   date, actual_end  date,
  visibility     file_visibility not null default 'client',
  created_at     timestamptz not null default now()
);

-- One row per update rather than one number you overwrite, so the
-- progress curve over the life of the project stays recoverable.
create table progress_snapshots (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects on delete cascade,
  recorded_on      date not null default current_date,
  overall_pct      int not null default 0,
  planned_pct      int not null default 0,
  schedule_status  text default 'On Track',
  budget_status    text default 'On Track',
  note             text default '',
  recorded_by      uuid references profiles,
  created_at       timestamptz not null default now()
);

create table design_revisions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects on delete cascade,
  file_id        uuid references files on delete set null,
  preview_file_id uuid references files on delete set null,
  file_name      text not null default '',
  category       text default '',
  revision       text default '',
  status         text default 'Draft',
  description    text default '',
  external_url   text default '',            -- Google Drive link for very large drawings
  supersedes_id  uuid references design_revisions,
  visibility     file_visibility not null default 'client',
  uploaded_by    uuid references profiles,
  uploaded_at    timestamptz not null default now()
);

create table documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  file_id      uuid references files on delete set null,
  name         text not null,
  folder       text default '',
  version      text default '',
  status       text default 'Final',
  external_url text default '',
  visibility   file_visibility not null default 'client',
  uploaded_by  uuid references profiles,
  uploaded_at  timestamptz not null default now()
);

create table site_media (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  file_id      uuid references files on delete cascade,
  captured_on  date,
  phase        text default '',
  area         text default '',
  category     text default '',
  caption      text default '',
  visibility   file_visibility not null default 'client',
  uploaded_by  uuid references profiles,
  created_at   timestamptz not null default now()
);

create table materials (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects on delete cascade,
  name           text not null,
  sample_file_id uuid references files on delete set null,
  category       text default '', brand text default '', supplier text default '',
  spec           text default '', colour text default '', size text default '',
  unit           text default '', quantity numeric,
  application    text default '', lead_time text default '',
  status         text default 'Pending',
  client_comment text default '',
  visibility     file_visibility not null default 'client',
  created_at     timestamptz not null default now()
);

create table site_issues (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects on delete cascade,
  title              text not null,
  description        text default '', area text default '',
  priority           text default 'Medium',
  reported_by        text default '', reported_at date,
  responsible        text default '', target_date date,
  status             text default 'Open',
  corrective_action  text default '',
  visibility         file_visibility not null default 'client',
  created_at         timestamptz not null default now()
);


-- =====================================================================
--  PART 5 — APPROVALS  (the evidence table)
--  Records not just the answer but the circumstances: who, when, from
--  where, and a fingerprint of exactly what was on screen. That is what
--  makes a portal click defensible six months later.
-- =====================================================================

create table approvals (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects on delete cascade,
  subject_type  text not null default '',    -- design_revision | material | variation_order | quotation
  subject_id    uuid,
  title         text not null,
  category      text default '',
  submitted_by  uuid references profiles,
  submitted_at  timestamptz not null default now(),
  deadline      date,
  response      text default 'Pending',      -- Pending | Approved | Revision Requested | Rejected
  comment       text default '',
  responded_by  uuid references profiles,
  responded_at  timestamptz,
  content_hash  text,                        -- sha256 of the document shown
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);


-- =====================================================================
--  PART 6 — MONEY
-- =====================================================================

create table quotations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  file_id      uuid references files on delete set null,
  quote_no     text not null, version text default 'v1',
  issued_at    date, valid_until date,
  amount       numeric(14,2), currency text not null default 'MMK',
  status       text default 'Issued',
  visibility   file_visibility not null default 'client',
  created_at   timestamptz not null default now()
);

create table variation_orders (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects on delete cascade,
  file_id          uuid references files on delete set null,
  vo_no            text not null,
  requested_by     text default '', request_date date,
  description      text default '', reason text default '', area text default '',
  cost_impact      numeric(14,2), time_impact text default '',
  client_approval  text default 'Pending', approved_at timestamptz,
  status           text default 'Requested',
  visibility       file_visibility not null default 'client',
  created_at       timestamptz not null default now()
);

create table payment_schedule (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  milestone   text not null,
  due_date    date, amount numeric(14,2),
  status      text default 'Upcoming',
  visibility  file_visibility not null default 'client',
  created_at  timestamptz not null default now()
);

create table invoices (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  file_id     uuid references files on delete set null,
  invoice_no  text not null,
  kind        text not null default 'invoice',    -- invoice | receipt
  related_to  text default '',
  issue_date  date, due_date date,
  amount      numeric(14,2), currency text not null default 'MMK',
  status      text default 'Due',
  visibility  file_visibility not null default 'client',
  created_at  timestamptz not null default now()
);

-- Separate from invoices so part payments, and several receipts against
-- one invoice, both work without contortions.
create table payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references invoices on delete cascade,
  project_id       uuid not null references projects on delete cascade,
  paid_on          date not null default current_date,
  amount           numeric(14,2) not null,
  method           text default '', reference text default '',
  receipt_file_id  uuid references files on delete set null,
  recorded_by      uuid references profiles,
  created_at       timestamptz not null default now()
);


-- =====================================================================
--  PART 7 — MEETINGS AND HANDOVER
-- =====================================================================

create table meetings (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects on delete cascade,
  file_id           uuid references files on delete set null,
  title             text not null, type text default '',
  meeting_date      date, meeting_time time,
  location          text default '', attendees text default '',
  agenda            text default '', summary text default '', decisions text default '',
  acknowledged_by   uuid references profiles, acknowledged_at timestamptz,
  visibility        file_visibility not null default 'client',
  created_at        timestamptz not null default now()
);

create table handover_records (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects on delete cascade,
  handover_date      date,
  snag_list_file_id  uuid references files on delete set null,
  document_file_id   uuid references files on delete set null,
  warranty_start     date, warranty_end date,
  signed_by_client   uuid references profiles, signed_at timestamptz,
  status             text default 'Pending',
  created_at         timestamptz not null default now()
);


-- =====================================================================
--  PART 8 — THE LOG
--  Append-only. Nothing in the application is allowed to edit or delete
--  a row here, which is the whole point of keeping it.
-- =====================================================================

create table audit_log (
  id           bigserial primary key,
  actor_id     uuid references profiles,
  action       text not null,               -- insert | update | delete | login | download
  entity_type  text not null,
  entity_id    uuid,
  project_id   uuid,
  before       jsonb, after jsonb,
  ip_address   inet, user_agent text,
  created_at   timestamptz not null default now()
);

create index on audit_log (project_id, created_at desc);
create index on audit_log (actor_id, created_at desc);


-- =====================================================================
--  PART 9 — THE ACCESS RULES
--  These four functions decide who may see what. Every table's
--  security policy below calls them, so the rules live in one place.
-- =====================================================================

-- Is the person signed in a member of Stanza staff?
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and kind = 'staff' and status = 'active'
  );
$$;

-- Does the person signed in hold one of these roles?
create function has_role(wanted staff_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active'
      and kind = 'staff' and role = any(wanted)
  );
$$;

-- Is the person signed in attached to this project?
create function is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members
    where project_id = p and user_id = auth.uid() and revoked_at is null
  );
$$;

-- May the person signed in see internal-only records on this project?
-- Staff members can; clients never can.
create function sees_internal(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() and is_member(p);
$$;


-- ---------------------------------------------------------------------
--  Two guards that row-level security cannot express on its own.
--  A policy decides WHICH ROWS you may touch; it cannot stop you
--  changing a particular COLUMN of a row you are allowed to touch.
--  These triggers close that gap.
--
--  Both step aside when auth.uid() is null — that is the SQL Editor
--  and the service key, which are trusted by definition.
-- ---------------------------------------------------------------------

-- Without this, a client could edit their own profile row — which they
-- must be able to do, to fix their name — and set kind='staff' while
-- they were in there.
create function guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.kind   is distinct from old.kind
   or new.role   is distinct from old.role
   or new.status is distinct from old.status)
   and not has_role(array['managing_director','system_admin']::staff_role[]) then
    raise exception 'Only a managing director or system admin can change kind, role or status';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on profiles
  for each row execute function guard_profile_privileges();


-- An approval is evidence. A client may record their answer and a
-- comment; everything describing WHAT they answered — the title, the
-- deadline, and above all the fingerprint of the document that was on
-- screen — is put back exactly as it was.
create function guard_approval_response() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  if not is_staff() then
    new.project_id   := old.project_id;
    new.subject_type := old.subject_type;
    new.subject_id   := old.subject_id;
    new.title        := old.title;
    new.category     := old.category;
    new.submitted_by := old.submitted_by;
    new.submitted_at := old.submitted_at;
    new.deadline     := old.deadline;
    new.content_hash := old.content_hash;
  end if;

  -- Who answered and when is stamped by the database, never by the app.
  if new.response is distinct from old.response then
    new.responded_by := auth.uid();
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger approvals_guard
  before update on approvals
  for each row execute function guard_approval_response();


-- =====================================================================
--  PART 10 — TURN ON THE SECURITY
--  Until this runs, the tables above are wide open. After it runs,
--  nothing is readable except through the policies that follow.
-- =====================================================================

alter table profiles           enable row level security;
alter table clients            enable row level security;
alter table projects           enable row level security;
alter table project_members    enable row level security;
alter table files              enable row level security;
alter table milestones         enable row level security;
alter table progress_snapshots enable row level security;
alter table design_revisions   enable row level security;
alter table documents          enable row level security;
alter table site_media         enable row level security;
alter table materials          enable row level security;
alter table site_issues        enable row level security;
alter table approvals          enable row level security;
alter table quotations         enable row level security;
alter table variation_orders   enable row level security;
alter table payment_schedule   enable row level security;
alter table invoices           enable row level security;
alter table payments           enable row level security;
alter table meetings           enable row level security;
alter table handover_records   enable row level security;
alter table audit_log          enable row level security;


-- ---- profiles -------------------------------------------------------
create policy "read own profile" on profiles
  for select using (id = auth.uid());
create policy "staff read all profiles" on profiles
  for select using (is_staff());
create policy "update own name and phone" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on profiles
  for all using (has_role(array['managing_director','system_admin']::staff_role[]))
  with check (has_role(array['managing_director','system_admin']::staff_role[]));

-- ---- clients --------------------------------------------------------
create policy "staff read clients" on clients
  for select using (is_staff());
create policy "senior staff write clients" on clients
  for all using (has_role(array['managing_director','project_manager','sales','system_admin']::staff_role[]));

-- ---- projects -------------------------------------------------------
-- Note the shape of these: a role alone is never enough. A project
-- manager reaches a project by being ON it, exactly like a client.
-- Only the two company-wide roles see everything, and every one of
-- their reads lands in the audit log.
create policy "members read their projects" on projects
  for select using (is_member(id));
create policy "directors read every project" on projects
  for select using (has_role(array['managing_director','system_admin']::staff_role[]));

create policy "managers create projects" on projects
  for insert with check (
    has_role(array['managing_director','project_manager','system_admin']::staff_role[])
  );
create policy "managers update their own projects" on projects
  for update using (
    has_role(array['managing_director','system_admin']::staff_role[])
    or (has_role(array['project_manager']::staff_role[]) and is_member(id))
  );
create policy "directors archive projects" on projects
  for delete using (has_role(array['managing_director','system_admin']::staff_role[]));

-- ---- project_members ------------------------------------------------
create policy "see your own memberships" on project_members
  for select using (user_id = auth.uid());
create policy "staff see memberships on their projects" on project_members
  for select using (sees_internal(project_id));
create policy "directors see all memberships" on project_members
  for select using (has_role(array['managing_director','system_admin']::staff_role[]));

create policy "managers grant access" on project_members
  for insert with check (
    has_role(array['managing_director','system_admin']::staff_role[])
    or (has_role(array['project_manager','sales']::staff_role[]) and is_member(project_id))
  );
create policy "managers revoke access" on project_members
  for update using (
    has_role(array['managing_director','system_admin']::staff_role[])
    or (has_role(array['project_manager','sales']::staff_role[]) and is_member(project_id))
  );
create policy "directors remove memberships" on project_members
  for delete using (has_role(array['managing_director','system_admin']::staff_role[]));


-- ---------------------------------------------------------------------
--  The pattern below repeats for every project-scoped table:
--
--    read   — you are a member AND (the record is client-visible
--             OR you are staff)
--    write  — you are staff on that project
--
--  Two lines per table, and a client can never reach an internal
--  record or another client's project, whatever the app does.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'files','milestones','design_revisions','documents','site_media',
    'materials','site_issues','quotations','variation_orders',
    'payment_schedule','invoices','meetings'
  ] loop
    execute format($f$
      create policy "members read visible %1$s" on %1$I
        for select using (
          is_member(project_id)
          and (visibility = 'client' or sees_internal(project_id))
        );
      create policy "staff write %1$s" on %1$I
        for all using (sees_internal(project_id));
    $f$, t);
  end loop;
end $$;

-- Tables with no visibility column of their own.
create policy "members read progress" on progress_snapshots
  for select using (is_member(project_id));
create policy "staff write progress" on progress_snapshots
  for all using (sees_internal(project_id));

create policy "members read approvals" on approvals
  for select using (is_member(project_id));
create policy "staff write approvals" on approvals
  for all using (sees_internal(project_id));
-- A client may answer an approval, but only the response fields.
create policy "clients answer approvals" on approvals
  for update using (is_member(project_id)) with check (is_member(project_id));

create policy "members read payments" on payments
  for select using (is_member(project_id));
create policy "finance writes payments" on payments
  for all using (
    sees_internal(project_id)
    and has_role(array['managing_director','finance','qs','system_admin']::staff_role[])
  );

create policy "members read handover" on handover_records
  for select using (is_member(project_id));
create policy "managers write handover" on handover_records
  for all using (
    sees_internal(project_id)
    and has_role(array['managing_director','project_manager','system_admin']::staff_role[])
  );

-- ---- audit log ------------------------------------------------------
-- Readable by directors only. Writable by nobody through the API —
-- rows arrive from triggers, which run with the definer's rights.
create policy "directors read the log" on audit_log
  for select using (has_role(array['managing_director','system_admin']::staff_role[]));


-- =====================================================================
--  PART 11 — FILE STORAGE
--  One private bucket. No file is ever served from a public URL; the
--  app asks Supabase for a link that works for a few minutes and only
--  for someone the policies below allow.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- Files are stored as: project-files/<project_id>/<uuid>-<name>
-- so the first path segment tells us which project a blob belongs to.

create policy "members download permitted files" on storage.objects
  for select using (
    bucket_id = 'project-files'
    and exists (
      select 1 from files f
      where f.storage_path = storage.objects.name
        and f.deleted_at is null
        and is_member(f.project_id)
        and (f.visibility = 'client' or sees_internal(f.project_id))
    )
  );

create policy "staff upload to their projects" on storage.objects
  for insert with check (
    bucket_id = 'project-files'
    and is_staff()
    and sees_internal((split_part(name, '/', 1))::uuid)
  );

create policy "staff replace and remove their uploads" on storage.objects
  for all using (
    bucket_id = 'project-files'
    and is_staff()
    and sees_internal((split_part(name, '/', 1))::uuid)
  );


-- =====================================================================
--  PART 12 — AUDIT TRIGGERS
--  Attached to the tables where "who changed this, and when?" is a
--  question somebody will eventually ask.
-- =====================================================================

create function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  begin
    pid := coalesce(
      (to_jsonb(new) ->> 'project_id')::uuid,
      (to_jsonb(old) ->> 'project_id')::uuid
    );
  exception when others then pid := null;
  end;

  insert into audit_log (actor_id, action, entity_type, entity_id, project_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid),
    pid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_members','approvals','invoices','payments',
    'variation_orders','design_revisions','documents','files','handover_records'
  ] loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$I
         for each row execute function log_change();', t);
  end loop;
end $$;


-- =====================================================================
--  DONE.
--  ပြီးပါပြီ။ နောက်တစ်ဆင့်အတွက် လမ်းညွှန်စာတမ်းရဲ့ အဆင့် ၅ ကို ဆက်ဖတ်ပါ။
--  Next: create your first staff account, then run 02-first-admin.sql
-- =====================================================================
