CREATE TABLE public.walkthroughs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '',
 mode text NOT NULL DEFAULT 'Interactive tour' CHECK(mode IN ('Interactive tour','Video')),
 status text NOT NULL DEFAULT 'Preparing' CHECK(status IN ('Preparing','Ready')),
 external_url text NOT NULL DEFAULT '' CHECK(external_url='' OR external_url ~ '^https://[^[:space:]]+$'),
 visibility public.file_visibility NOT NULL DEFAULT 'client',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'Ready' OR external_url <> '')
);
CREATE INDEX walkthroughs_project ON public.walkthroughs(project_id);
ALTER TABLE public.walkthroughs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.walkthroughs FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.walkthroughs TO authenticated;
CREATE POLICY walkthroughs_read ON public.walkthroughs FOR SELECT TO authenticated
USING(private.is_active() AND (private.sees_internal(project_id) OR (private.is_member(project_id) AND visibility='client')));
CREATE POLICY walkthroughs_insert ON public.walkthroughs FOR INSERT TO authenticated
WITH CHECK(private.can_write(project_id,'design_revisions','INSERT'));
CREATE POLICY walkthroughs_update ON public.walkthroughs FOR UPDATE TO authenticated
USING(private.can_write(project_id,'design_revisions','UPDATE')) WITH CHECK(private.can_write(project_id,'design_revisions','UPDATE'));
CREATE POLICY walkthroughs_delete ON public.walkthroughs FOR DELETE TO authenticated
USING(private.can_write(project_id,'design_revisions','DELETE'));
