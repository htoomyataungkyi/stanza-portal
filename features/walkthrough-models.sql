ALTER TABLE public.walkthroughs ADD COLUMN model jsonb;
ALTER TABLE public.walkthroughs DROP CONSTRAINT walkthroughs_mode_check;
ALTER TABLE public.walkthroughs ADD CONSTRAINT walkthroughs_mode_check CHECK(mode IN ('Interactive tour','Video','3D walkthrough'));
ALTER TABLE public.walkthroughs DROP CONSTRAINT walkthroughs_check;
ALTER TABLE public.walkthroughs ADD CONSTRAINT walkthroughs_ready_check CHECK(status <> 'Ready' OR external_url <> '' OR (mode='3D walkthrough' AND model IS NOT NULL));
ALTER TABLE public.walkthroughs ADD CONSTRAINT walkthroughs_model_check CHECK(model IS NULL OR (jsonb_typeof(model)='object' AND jsonb_typeof(model->'areas')='array'));
