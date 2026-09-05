BEGIN;
-- Roll back all synthetic fixtures; no login credentials or emails are sent.
CREATE TEMP TABLE qa_p1_ids(label text primary key,id uuid default gen_random_uuid());
INSERT INTO qa_p1_ids(label) VALUES ('client'),('disabled'),('designer'),('finance'),('subcontractor'),('project_manager'),('managing_director'),('system_admin'),('sales'),('qs'),('product_owner'),('project'),('other'),('approval'),('invoice');
GRANT SELECT ON qa_p1_ids TO authenticated;
INSERT INTO auth.users(id,email) SELECT id,'qa-p1-'||id::text||'@example.invalid' FROM qa_p1_ids WHERE label NOT IN ('project','other','approval','invoice');
UPDATE public.profiles p SET kind=CASE WHEN q.label IN ('client','disabled') THEN 'client'::public.user_kind ELSE 'staff'::public.user_kind END,
role=CASE WHEN q.label IN ('client','disabled') THEN NULL ELSE q.label::public.staff_role END,
status=CASE WHEN q.label='disabled' THEN 'disabled' ELSE 'active' END
FROM qa_p1_ids q WHERE p.id=q.id;
INSERT INTO public.projects(id,code,name) SELECT id,'QA-P1-'||id::text,'Temporary P1 test' FROM qa_p1_ids WHERE label IN ('project','other');
INSERT INTO public.project_members(project_id,user_id)
SELECT p.id,u.id FROM qa_p1_ids p CROSS JOIN qa_p1_ids u WHERE p.label='project' AND u.label NOT IN ('project','other','approval','invoice');
INSERT INTO public.approvals(id,project_id,title,response,content_hash)
SELECT a.id,p.id,'Original evidence','Pending','original-hash' FROM qa_p1_ids a CROSS JOIN qa_p1_ids p WHERE a.label='approval' AND p.label='project';
INSERT INTO public.invoices(id,project_id,invoice_no,amount)
SELECT a.id,p.id,'QA-INVOICE',100 FROM qa_p1_ids a CROSS JOIN qa_p1_ids p WHERE a.label='invoice' AND p.label='project';

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qa_p1_ids WHERE label='project_manager'),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE pid uuid; cid uuid; did uuid; n int; stamp timestamptz;
BEGIN
 SELECT id INTO pid FROM qa_p1_ids WHERE label='project';
 SELECT id INTO cid FROM qa_p1_ids WHERE label='client';
 UPDATE public.project_members SET revoked_at=now(),role_note='keep existing note' WHERE project_id=pid AND user_id=cid;
 INSERT INTO public.project_members(project_id,user_id,granted_by,granted_at,revoked_at)
 VALUES(pid,cid,auth.uid(),now(),null)
 ON CONFLICT(project_id,user_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=EXCLUDED.granted_at,revoked_at=EXCLUDED.revoked_at;
 SELECT count(*) INTO n FROM public.project_members WHERE project_id=pid AND user_id=cid AND revoked_at IS NULL AND role_note='keep existing note';
 IF n<>1 THEN RAISE EXCEPTION 'Membership restore failed'; END IF;
 INSERT INTO public.documents(project_id,name,external_url) VALUES(pid,'P2 temporary document','https://example.invalid') RETURNING id,uploaded_at INTO did,stamp;
 IF stamp IS NULL THEN RAISE EXCEPTION 'Upload date default failed'; END IF;
 UPDATE public.documents SET external_url='' WHERE id=did;
 SELECT count(*) INTO n FROM public.documents WHERE id=did AND external_url='';
 IF n<>1 THEN RAISE EXCEPTION 'Text clear failed'; END IF;
 INSERT INTO public.site_issues(project_id,title,target_date) VALUES(pid,'P2 temporary issue',current_date) RETURNING id INTO did;
 UPDATE public.site_issues SET target_date=null WHERE id=did;
 SELECT count(*) INTO n FROM public.site_issues WHERE id=did AND target_date IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Date clear failed'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'P2 database regression passed; all synthetic records rolled back' AS result;
