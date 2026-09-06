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
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='project_manager'),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE pid uuid; bid uuid; n int;
BEGIN
 SELECT id INTO pid FROM notification_qa WHERE label='project';
 SELECT public.send_notification(pid,'QA notice','Rollback-only test','clients',NULL) INTO bid;
 SELECT count(*) INTO n FROM public.notifications WHERE batch_id=bid;
 IF n<>2 THEN RAISE EXCEPTION 'Client audience mismatch'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.notifications;
 IF n<>1 THEN RAISE EXCEPTION 'Private recipient inbox mismatch'; END IF;
 UPDATE public.notifications SET read_at=now(); GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Read tracking failed'; END IF;
 BEGIN
  PERFORM public.send_notification((SELECT id FROM notification_qa WHERE label='project'),'Denied','Denied','all',NULL);
  RAISE EXCEPTION 'Client sending allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'Current notification RPC: audience, private inbox, read tracking and unauthorized send checks passed; fixtures rolled back' AS result;
