-- Empty task-tag structure for the independent Jacoby database.
CREATE TABLE IF NOT EXISTS public.task_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_tags ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.task_tags ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.task_tag_links (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.task_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tag_id UUID REFERENCES public.task_tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS task_tag_links_task_idx ON public.task_tag_links(task_id);
CREATE INDEX IF NOT EXISTS task_tag_links_tag_idx ON public.task_tag_links(tag_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_tag_links TO authenticated;
GRANT ALL ON public.task_tags, public.task_tag_links TO service_role;

ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tag_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jacoby_task_tags_authenticated ON public.task_tags;
CREATE POLICY jacoby_task_tags_authenticated ON public.task_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS jacoby_task_tag_links_authenticated ON public.task_tag_links;
CREATE POLICY jacoby_task_tag_links_authenticated ON public.task_tag_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.jacoby_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jacoby_task_tags_updated_at ON public.task_tags;
CREATE TRIGGER jacoby_task_tags_updated_at
  BEFORE UPDATE ON public.task_tags
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_set_updated_at();

NOTIFY pgrst, 'reload schema';
