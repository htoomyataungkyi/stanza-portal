-- P1 security hardening. Run atomically after the existing live schema.
CREATE OR REPLACE FUNCTION private.is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active');
$$;
REVOKE ALL ON FUNCTION private.is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active() TO authenticated;
CREATE OR REPLACE FUNCTION private.is_member(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.project_members m JOIN public.profiles u ON u.id=m.user_id
 WHERE m.project_id=p AND m.user_id=auth.uid() AND m.revoked_at IS NULL AND u.status='active');
$$;
CREATE OR REPLACE FUNCTION private.can_write(p uuid, resource text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT private.sees_internal(p) AND (
 private.has_role(ARRAY['managing_director']::public.staff_role[])
 OR CASE resource
 WHEN 'milestones' THEN private.has_role(ARRAY['project_manager']::public.staff_role[])
 WHEN 'progress_snapshots' THEN private.has_role(ARRAY['project_manager']::public.staff_role[])
 WHEN 'design_revisions' THEN private.has_role(ARRAY['project_manager','designer']::public.staff_role[])
 WHEN 'materials' THEN private.has_role(ARRAY['project_manager','designer','qs']::public.staff_role[])
 WHEN 'site_media' THEN private.has_role(ARRAY['project_manager']::public.staff_role[]) OR (operation='INSERT' AND private.has_role(ARRAY['subcontractor']::public.staff_role[]))
 WHEN 'site_issues' THEN private.has_role(ARRAY['project_manager']::public.staff_role[])
 WHEN 'documents' THEN private.has_role(ARRAY['project_manager','designer','sales']::public.staff_role[])
 WHEN 'meetings' THEN private.has_role(ARRAY['project_manager','sales']::public.staff_role[])
 WHEN 'project_team' THEN private.has_role(ARRAY['project_manager']::public.staff_role[])
 WHEN 'approvals' THEN private.has_role(ARRAY['project_manager','designer']::public.staff_role[])
 WHEN 'boq_items' THEN private.has_role(ARRAY['qs']::public.staff_role[])
 WHEN 'quotations' THEN private.has_role(ARRAY['qs','finance']::public.staff_role[])
 WHEN 'variation_orders' THEN private.has_role(ARRAY['project_manager','qs']::public.staff_role[])
 WHEN 'payment_schedule' THEN private.has_role(ARRAY['finance','qs']::public.staff_role[])
 WHEN 'invoices' THEN private.has_role(ARRAY['finance','qs']::public.staff_role[])
 WHEN 'payments' THEN private.has_role(ARRAY['finance','qs']::public.staff_role[])
 WHEN 'finance_summary' THEN private.has_role(ARRAY['finance','qs']::public.staff_role[])
 WHEN 'handover_records' THEN private.has_role(ARRAY['project_manager']::public.staff_role[])
 ELSE false END);
$$;
REVOKE ALL ON FUNCTION private.can_write(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_write(uuid,text,text) TO authenticated;
DO $guard$
DECLARE t text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
 EXECUTE format('CREATE POLICY p1_active_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.is_active()) WITH CHECK (private.is_active())',t);
 END LOOP;
END $guard$;
CREATE POLICY p1_role_insert ON public.milestones AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'milestones', 'INSERT'));
CREATE POLICY p1_role_update ON public.milestones AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'milestones', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'milestones', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.milestones AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'milestones', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.progress_snapshots AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'progress_snapshots', 'INSERT'));
CREATE POLICY p1_role_update ON public.progress_snapshots AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'progress_snapshots', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'progress_snapshots', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.progress_snapshots AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'progress_snapshots', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.design_revisions AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'design_revisions', 'INSERT'));
CREATE POLICY p1_role_update ON public.design_revisions AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'design_revisions', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'design_revisions', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.design_revisions AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'design_revisions', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.materials AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'materials', 'INSERT'));
CREATE POLICY p1_role_update ON public.materials AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'materials', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'materials', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.materials AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'materials', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.site_media AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'site_media', 'INSERT'));
CREATE POLICY p1_role_update ON public.site_media AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'site_media', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'site_media', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.site_media AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'site_media', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.site_issues AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'site_issues', 'INSERT'));
CREATE POLICY p1_role_update ON public.site_issues AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'site_issues', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'site_issues', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.site_issues AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'site_issues', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.documents AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'documents', 'INSERT'));
CREATE POLICY p1_role_update ON public.documents AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'documents', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'documents', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.documents AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'documents', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.meetings AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'meetings', 'INSERT'));
CREATE POLICY p1_role_update ON public.meetings AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'meetings', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'meetings', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.meetings AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'meetings', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.project_team AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'project_team', 'INSERT'));
CREATE POLICY p1_role_update ON public.project_team AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'project_team', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'project_team', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.project_team AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'project_team', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.approvals AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'approvals', 'INSERT'));
CREATE POLICY p1_role_update ON public.approvals AS RESTRICTIVE FOR UPDATE TO authenticated USING ((private.can_write(project_id, 'approvals', 'UPDATE') OR (private.is_member(project_id) AND NOT private.is_staff()))) WITH CHECK ((private.can_write(project_id, 'approvals', 'UPDATE') OR (private.is_member(project_id) AND NOT private.is_staff())));
CREATE POLICY p1_role_delete ON public.approvals AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'approvals', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.boq_items AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'boq_items', 'INSERT'));
CREATE POLICY p1_role_update ON public.boq_items AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'boq_items', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'boq_items', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.boq_items AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'boq_items', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.quotations AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'quotations', 'INSERT'));
CREATE POLICY p1_role_update ON public.quotations AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'quotations', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'quotations', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.quotations AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'quotations', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.variation_orders AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'variation_orders', 'INSERT'));
CREATE POLICY p1_role_update ON public.variation_orders AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'variation_orders', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'variation_orders', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.variation_orders AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'variation_orders', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.payment_schedule AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'payment_schedule', 'INSERT'));
CREATE POLICY p1_role_update ON public.payment_schedule AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'payment_schedule', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'payment_schedule', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.payment_schedule AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'payment_schedule', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.invoices AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'invoices', 'INSERT'));
CREATE POLICY p1_role_update ON public.invoices AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'invoices', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'invoices', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.invoices AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'invoices', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'payments', 'INSERT'));
CREATE POLICY p1_role_update ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'payments', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'payments', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.payments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'payments', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.finance_summary AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'finance_summary', 'INSERT'));
CREATE POLICY p1_role_update ON public.finance_summary AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'finance_summary', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'finance_summary', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.finance_summary AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'finance_summary', 'DELETE')) ;
CREATE POLICY p1_role_insert ON public.handover_records AS RESTRICTIVE FOR INSERT TO authenticated  WITH CHECK (private.can_write(project_id, 'handover_records', 'INSERT'));
CREATE POLICY p1_role_update ON public.handover_records AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write(project_id, 'handover_records', 'UPDATE')) WITH CHECK (private.can_write(project_id, 'handover_records', 'UPDATE'));
CREATE POLICY p1_role_delete ON public.handover_records AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write(project_id, 'handover_records', 'DELETE')) ;

CREATE OR REPLACE FUNCTION private.can_write_file(p uuid, category text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT private.can_write(p, CASE category
 WHEN 'design' THEN 'design_revisions' WHEN 'site_photo' THEN 'site_media'
 WHEN 'material_sample' THEN 'materials' WHEN 'invoice' THEN 'invoices'
 WHEN 'receipt' THEN 'invoices' WHEN 'quotation' THEN 'quotations'
 WHEN 'meeting_minutes' THEN 'meetings' WHEN 'contract' THEN 'documents'
 ELSE 'variation_orders' END, operation);
$$;
REVOKE ALL ON FUNCTION private.can_write_file(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_write_file(uuid,text,text) TO authenticated;
CREATE POLICY p1_file_insert ON public.files AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (private.can_write_file(project_id,category::text,'INSERT') AND uploaded_by=auth.uid()
 AND split_part(storage_path,'/',1)=project_id::text);
CREATE POLICY p1_file_update ON public.files AS RESTRICTIVE FOR UPDATE TO authenticated
USING (private.can_write_file(project_id,category::text,'UPDATE'))
WITH CHECK (private.can_write_file(project_id,category::text,'UPDATE') AND split_part(storage_path,'/',1)=project_id::text);
CREATE POLICY p1_file_delete ON public.files AS RESTRICTIVE FOR DELETE TO authenticated
USING (private.can_write_file(project_id,category::text,'DELETE'));
-- Uploaded objects are immutable. Replacements use a new UUID path in the app.
CREATE POLICY p1_immutable_objects ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id <> 'project-files') WITH CHECK (bucket_id <> 'project-files');
CREATE POLICY p1_object_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id <> 'project-files' OR (private.has_role(ARRAY['managing_director']::public.staff_role[])
AND private.is_member((split_part(name,'/',1))::uuid)));
CREATE OR REPLACE FUNCTION public.guard_approval_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE answer text; note text;
BEGIN
 IF auth.uid() IS NULL THEN
   IF current_setting('role',true) IN ('anon','authenticated') THEN
     RAISE EXCEPTION 'An authenticated actor is required' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 IF NOT private.is_active() THEN RAISE EXCEPTION 'Account inactive' USING ERRCODE='42501'; END IF;
 IF NOT private.is_staff() THEN
   answer := NEW.response; note := NEW.comment;
   NEW := OLD;
   NEW.response := answer; NEW.comment := note;
 END IF;
 -- Ignore caller-supplied identity/timestamps even for unchanged responses.
 NEW.responded_by := OLD.responded_by;
 NEW.responded_at := OLD.responded_at;
 NEW.ip_address := OLD.ip_address;
 NEW.user_agent := OLD.user_agent;
 IF NEW.response IS DISTINCT FROM OLD.response OR NEW.comment IS DISTINCT FROM OLD.comment THEN
   NEW.responded_by := auth.uid();
   NEW.responded_at := clock_timestamp();
 END IF;
 RETURN NEW;
END;
$$;

