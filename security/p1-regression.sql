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
SET LOCAL ROLE authenticated;
DO $tests$
DECLARE u record; pid uuid; aid uuid; iid uuid; n int; r public.approvals; expected boolean; actual boolean;
BEGIN
 SELECT id INTO pid FROM qa_p1_ids WHERE label='project';
 SELECT id INTO aid FROM qa_p1_ids WHERE label='approval';
 SELECT id INTO iid FROM qa_p1_ids WHERE label='invoice';
 FOR u IN SELECT * FROM qa_p1_ids WHERE label NOT IN ('project','other','approval','invoice') LOOP
 PERFORM set_config('request.jwt.claim.sub',u.id::text,true);
 IF private.is_member(pid) IS DISTINCT FROM (u.label<>'disabled') THEN RAISE EXCEPTION 'Membership test failed: %',u.label; END IF;
 IF private.is_member((SELECT id FROM qa_p1_ids WHERE label='other')) THEN RAISE EXCEPTION 'Cross project membership'; END IF;
 actual := private.can_write(pid,'invoices','UPDATE');
 expected := u.label IN ('finance','qs','managing_director','product_owner');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Invoice role test failed: %',u.label; END IF;
 IF u.label='disabled' THEN
   SELECT count(*) INTO n FROM public.invoices WHERE id=iid;
   IF n<>0 THEN RAISE EXCEPTION 'Disabled user can read invoice'; END IF;
   UPDATE public.approvals SET response='Approved' WHERE id=aid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>0 THEN RAISE EXCEPTION 'Disabled user can answer'; END IF;
 END IF;
 IF u.label IN ('designer','subcontractor','system_admin','sales','client') THEN
   UPDATE public.invoices SET amount=999 WHERE id=iid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>0 THEN RAISE EXCEPTION 'Unauthorized invoice update: %',u.label; END IF;
   DELETE FROM public.invoices WHERE id=iid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>0 THEN RAISE EXCEPTION 'Unauthorized invoice delete: %',u.label; END IF;
   BEGIN
     INSERT INTO public.invoices(project_id,invoice_no) VALUES(pid,'FORBIDDEN');
     RAISE EXCEPTION 'Unauthorized invoice insert: %',u.label;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END IF;
 IF u.label='finance' THEN
   UPDATE public.invoices SET amount=200 WHERE id=iid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>1 THEN RAISE EXCEPTION 'Finance cannot update invoice'; END IF;
 END IF;
 IF u.label='subcontractor' THEN
   INSERT INTO public.site_media(project_id,caption) VALUES(pid,'Permitted photo entry');
   UPDATE public.site_media SET caption='Forbidden edit' WHERE project_id=pid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>0 THEN RAISE EXCEPTION 'Subcontractor can edit'; END IF;
   UPDATE public.approvals SET title='Forbidden staff edit' WHERE id=aid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>0 THEN RAISE EXCEPTION 'Subcontractor can edit approval'; END IF;
 END IF;
 IF u.label='client' THEN
   UPDATE public.approvals SET title='Forged title',content_hash='forged',responded_by=u.id,responded_at='2000-01-01',created_at='2000-01-01'
   WHERE id=aid RETURNING * INTO r;
   IF r.title<>'Original evidence' OR r.content_hash<>'original-hash' OR r.responded_by IS NOT NULL OR r.responded_at IS NOT NULL OR r.created_at<'2020-01-01'
   THEN RAISE EXCEPTION 'Evidence tampering accepted'; END IF;
   UPDATE public.approvals SET response='Approved',comment='Approved by test',responded_at='2000-01-01' WHERE id=aid RETURNING * INTO r;
   IF r.response<>'Approved' OR r.responded_by<>u.id OR r.responded_at<'2020-01-01' THEN RAISE EXCEPTION 'Valid answer failed'; END IF;
 END IF;
 END LOOP;
END $tests$;
RESET ROLE;

ROLLBACK;

