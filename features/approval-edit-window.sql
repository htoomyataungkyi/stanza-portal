begin;
alter table public.approvals add column approved_once_at timestamptz, add column client_edit_until timestamptz, add column reopen_count integer not null default 0;
-- Existing approvals retain their known response time; unknown dates stay locked.
update public.approvals set approved_once_at=coalesce(responded_at,now()-interval '1 hour'),client_edit_until=coalesce(responded_at+interval '1 hour',now()) where response='Approved';
create table public.approval_history (
 id uuid primary key default gen_random_uuid(), approval_id uuid not null, project_id uuid not null,
 actor_id uuid, actor_name text not null, event text not null, occurred_at timestamptz not null default clock_timestamp(),
 before_response text, after_response text, before_comment text, after_comment text, edit_until timestamptz
);
alter table public.approval_history enable row level security;
revoke all on public.approval_history from anon,authenticated;
grant select on public.approval_history to authenticated;
create policy approval_history_read on public.approval_history for select to authenticated using(private.is_active() and (private.is_member(project_id) or private.sees_internal(project_id)) and exists(select 1 from public.approvals a where a.id=approval_id and a.project_id=approval_history.project_id));
create index approval_history_lookup on public.approval_history(approval_id,occurred_at desc);
create index approval_history_project on public.approval_history(project_id);
create function private.guard_approval_window() returns trigger language plpgsql security definer set search_path='' as $$
declare answer text; note text; reopen boolean; staff boolean;
begin
 if auth.uid() is null then
  if current_setting('role',true) in ('anon','authenticated') then raise exception 'Sign in required' using errcode='42501'; end if;
  return new;
 end if;
 if not private.is_active() then raise exception 'Account inactive' using errcode='42501'; end if;
 staff:=private.is_staff();
 if tg_op='INSERT' then
  new.approved_once_at:=null; new.client_edit_until:=null; new.reopen_count:=0;
 else
  reopen:=new.reopen_count is distinct from old.reopen_count;
  if not staff then
   if reopen or new.approved_once_at is distinct from old.approved_once_at or new.client_edit_until is distinct from old.client_edit_until then raise exception 'Only an administrator can reopen editing' using errcode='42501'; end if;
   if (new.response is distinct from old.response or new.comment is distinct from old.comment) and old.approved_once_at is not null and (old.client_edit_until is null or clock_timestamp()>=old.client_edit_until) then raise exception 'Editing is locked. Ask your administrator to reopen it.' using errcode='42501'; end if;
   answer:=new.response; note:=new.comment; new:=old; new.response:=answer; new.comment:=note;
  end if;
  new.approved_once_at:=old.approved_once_at; new.client_edit_until:=old.client_edit_until; new.reopen_count:=old.reopen_count;
  new.responded_by:=old.responded_by; new.responded_at:=old.responded_at; new.ip_address:=old.ip_address; new.user_agent:=old.user_agent;
  if reopen then
   if not staff or private.is_view_only() or not private.can_write(old.project_id,'approvals','UPDATE') then raise exception 'Not permitted to reopen' using errcode='42501'; end if;
   new.reopen_count:=old.reopen_count+1; new.client_edit_until:=clock_timestamp()+interval '1 hour';
  end if;
 end if;
 if tg_op='INSERT' or new.response is distinct from old.response or new.comment is distinct from old.comment then
  new.responded_by:=auth.uid(); new.responded_at:=clock_timestamp();
  if new.response='Approved' and new.approved_once_at is null then
   new.approved_once_at:=clock_timestamp(); new.client_edit_until:=new.approved_once_at+interval '1 hour';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_approval_window() from public,anon,authenticated;
drop trigger approvals_guard on public.approvals;
create trigger approvals_guard before insert or update on public.approvals for each row execute function private.guard_approval_window();
create function private.record_approval_history() returns trigger language plpgsql security definer set search_path='' as $$
declare actor text; kind text;
begin
 select full_name into actor from public.profiles where id=auth.uid();
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 kind:=case when tg_op='DELETE' then 'deleted' when tg_op='INSERT' then 'created' when new.reopen_count is distinct from old.reopen_count then 'reopened' else 'updated' end;
 insert into public.approval_history(approval_id,project_id,actor_id,actor_name,event,before_response,after_response,before_comment,after_comment,edit_until)
 values(coalesce(new.id,old.id),coalesce(new.project_id,old.project_id),auth.uid(),coalesce(actor,'System'),kind,old.response,new.response,old.comment,new.comment,new.client_edit_until);
 return coalesce(new,old);
end $$;
revoke all on function private.record_approval_history() from public,anon,authenticated;
create trigger approval_history_record after insert or update or delete on public.approvals for each row execute function private.record_approval_history();
insert into public.approval_history(approval_id,project_id,actor_name,event,after_response,after_comment,edit_until) select id,project_id,'System','history_started',response,comment,client_edit_until from public.approvals;
commit;
