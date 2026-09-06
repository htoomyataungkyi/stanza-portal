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
DECLARE pid uuid;
BEGIN
 SELECT id INTO pid FROM notification_qa WHERE label='project';
 INSERT INTO public.walkthroughs(project_id,title,mode,status,model,visibility) VALUES(pid,'Visible model','3D walkthrough','Ready','{"areas":[]}','client'),(pid,'Internal model','3D walkthrough','Ready','{"areas":[]}','internal');
 BEGIN
  INSERT INTO public.walkthroughs(project_id,title,mode,status) VALUES(pid,'Missing media','Video','Ready');
  RAISE EXCEPTION 'Ready without media allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM notification_qa WHERE label='client'),true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.walkthroughs;
 IF n<>1 THEN RAISE EXCEPTION 'Walkthrough privacy or access failed'; END IF;
 UPDATE public.walkthroughs SET title='Tampered'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Client editing allowed'; END IF;
 BEGIN
  INSERT INTO public.walkthroughs(project_id,title) SELECT id,'Client write' FROM notification_qa WHERE label='project';
  RAISE EXCEPTION 'Client insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
UPDATE public.project_members SET revoked_at=now() WHERE user_id=(SELECT id FROM notification_qa WHERE label='client');
SET LOCAL ROLE authenticated;
DO $test$ BEGIN IF EXISTS(SELECT 1 FROM public.walkthroughs) THEN RAISE EXCEPTION 'Revoked walkthrough access allowed'; END IF; END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'Walkthrough role, visibility, revocation and ready-state tests passed; all fixtures rolled back' AS result;
