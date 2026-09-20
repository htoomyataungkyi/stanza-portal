BEGIN;
CREATE TEMP TABLE notification_qa(label text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
INSERT INTO notification_qa(label) VALUES ('client'),('client2'),('outsider'),('disabled'),('project_manager'),('designer'),('system_admin'),('project'),('other'),('batch'),('badbatch');
GRANT SELECT ON notification_qa TO authenticated;
INSERT INTO auth.users(id,email) SELECT id,'notification-qa-'||id||'@example.invalid' FROM notification_qa WHERE label IN ('client','client2','outsider','disabled','project_manager','designer','system_admin');
UPDATE public.profiles p SET kind=CASE WHEN q.label IN ('project_manager','designer','system_admin') THEN 'staff'::public.user_kind ELSE 'client'::public.user_kind END,
 role=CASE WHEN q.label IN ('project_manager','designer','system_admin') THEN q.label::public.staff_role ELSE NULL END,
 status=CASE WHEN q.label='disabled' THEN 'disabled' ELSE 'active' END
FROM notification_qa q WHERE p.id=q.id;
INSERT INTO public.projects(id,code,name) SELECT id,'QA-N-'||id,'Notification rollback test' FROM notification_qa WHERE label IN ('project','other');
INSERT INTO public.project_members(project_id,user_id) SELECT p.id,u.id FROM notification_qa p CROSS JOIN notification_qa u WHERE p.label='project' AND u.label IN ('client','client2','disabled','project_manager','designer');

INSERT INTO public.approvals(project_id,title) SELECT id,'QA approval lock' FROM notification_qa WHERE label='project';
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE first_until timestamptz; BEGIN
 UPDATE public.approvals SET response='Approved' WHERE title='QA approval lock' RETURNING client_edit_until INTO first_until;
 IF first_until IS NULL OR first_until < now()+interval '59 minutes' THEN RAISE EXCEPTION 'Window missing'; END IF;
 UPDATE public.approvals SET comment='Edit within window' WHERE title='QA approval lock';
 UPDATE public.approvals SET response='Revision Requested' WHERE title='QA approval lock';
 UPDATE public.approvals SET response='Approved' WHERE title='QA approval lock';
 IF (SELECT client_edit_until FROM public.approvals WHERE title='QA approval lock')<>first_until THEN RAISE EXCEPTION 'Window reset'; END IF;
 BEGIN UPDATE public.approvals SET reopen_count=1 WHERE title='QA approval lock'; RAISE EXCEPTION 'Client reopened'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.approval_history; RAISE EXCEPTION 'History deleted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.approval_history)<5 THEN RAISE EXCEPTION 'History missing'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.approvals SET client_edit_until=now()-interval '1 second' WHERE title='QA approval lock' AND project_id=(SELECT id FROM notification_qa WHERE label='project');
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN UPDATE public.approvals SET comment='Late edit' WHERE title='QA approval lock'; RAISE EXCEPTION 'Late edit allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='project_manager'),true);
SET LOCAL ROLE authenticated;
UPDATE public.approvals SET reopen_count=reopen_count+1 WHERE title='QA approval lock';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 UPDATE public.approvals SET comment='Reopened edit' WHERE title='QA approval lock';
 IF NOT EXISTS(SELECT 1 FROM public.approval_history WHERE event='reopened') THEN RAISE EXCEPTION 'Reopen history missing'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='outsider'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.approval_history) THEN RAISE EXCEPTION 'History leaked'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.project_members SET revoked_at=now() WHERE user_id=(SELECT id FROM notification_qa WHERE label='client');
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.approval_history) THEN RAISE EXCEPTION 'Revoked member history leaked'; END IF; END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Approval lock, fixed window, admin reopen, history and privacy checks passed; fixtures rolled back' AS result;
