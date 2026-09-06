CREATE POLICY view_only_no_insert ON public.walkthroughs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT private.is_view_only());
CREATE POLICY view_only_no_update ON public.walkthroughs AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT private.is_view_only()) WITH CHECK (NOT private.is_view_only());
CREATE POLICY view_only_no_delete ON public.walkthroughs AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT private.is_view_only());
