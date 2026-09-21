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


SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='system_admin'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 INSERT INTO public.progress_snapshots(project_id,overall_pct,planned_pct,recorded_on,recorded_by) SELECT id,68,70,current_date,auth.uid() FROM notification_qa WHERE label='project';
 IF NOT EXISTS(SELECT 1 FROM public.progress_snapshots WHERE project_id=(SELECT id FROM notification_qa WHERE label='project') AND overall_pct=68) THEN RAISE EXCEPTION 'Progress save failed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
 INSERT INTO public.progress_snapshots(project_id,overall_pct,planned_pct,recorded_on,recorded_by) SELECT id,100,100,current_date,auth.uid() FROM notification_qa WHERE label='project';
 RAISE EXCEPTION 'Client write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Admin overall progress persisted; client denied; fixtures rolled back' AS result;
