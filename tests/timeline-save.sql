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

INSERT INTO public.milestones(project_id,name,sequence,status,progress_pct) SELECT id,'Timeline save QA',9,'Not Started',0 FROM notification_qa WHERE label='project';
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='system_admin'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
 UPDATE public.milestones SET status='In Progress',progress_pct=68,planned_start=null,actual_end=null WHERE name='Timeline save QA'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Admin update failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.milestones WHERE name='Timeline save QA' AND status='In Progress' AND progress_pct=68 AND sequence=9) THEN RAISE EXCEPTION 'Saved values mismatch'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
 UPDATE public.milestones SET progress_pct=100 WHERE name='Timeline save QA'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Client write allowed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Admin timeline status/progress persisted; order preserved; client denied; fixtures rolled back' AS result;
