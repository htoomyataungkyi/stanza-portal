-- Emergency rollback only. Restores the previous access rules and their known weaknesses.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE policyname LIKE 'p1_%' LOOP EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.guard_approval_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then return new; end if;

  if not private.is_staff() then
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
$function$

CREATE OR REPLACE FUNCTION private.is_member(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select exists (
    select 1 from project_members
    where project_id = p and user_id = auth.uid() and revoked_at is null
  );
$function$

DROP FUNCTION private.can_write_file(uuid,text,text);
DROP FUNCTION private.can_write(uuid,text,text);
DROP FUNCTION private.is_active();

