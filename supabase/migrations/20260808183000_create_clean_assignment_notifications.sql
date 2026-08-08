-- In-app notifications for task and subtask assignments.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jacoby_notifications_select ON public.notifications;
CREATE POLICY jacoby_notifications_select ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS jacoby_notifications_update ON public.notifications;
CREATE POLICY jacoby_notifications_update ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS jacoby_notifications_delete ON public.notifications;
CREATE POLICY jacoby_notifications_delete ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS jacoby_notifications_insert ON public.notifications;
CREATE POLICY jacoby_notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.jacoby_notify_task_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  assigner_name TEXT;
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN RETURN NEW; END IF;
  IF NEW.assignee_id = actor THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, email) INTO assigner_name FROM public.profiles WHERE id = actor;
  INSERT INTO public.notifications (user_id, task_id, type, title, body)
  VALUES (NEW.assignee_id, NEW.id, 'assignment', 'Nova tarefa atribuída a você',
    COALESCE(assigner_name, 'Alguém') || ' atribuiu: ' || COALESCE(NEW.title, 'Tarefa sem título'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.jacoby_notify_subtask_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  assigner_name TEXT;
  parent_title TEXT;
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN RETURN NEW; END IF;
  IF NEW.assignee_id = actor THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, email) INTO assigner_name FROM public.profiles WHERE id = actor;
  SELECT title INTO parent_title FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.notifications (user_id, task_id, type, title, body)
  VALUES (NEW.assignee_id, NEW.task_id, 'subtask_assignment', 'Nova subtarefa atribuída a você',
    COALESCE(assigner_name, 'Alguém') || ' atribuiu a subtarefa "' || regexp_replace(COALESCE(NEW.title, ''), '<[^>]+>', '', 'g') ||
    '" em: ' || COALESCE(parent_title, 'Tarefa sem título'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jacoby_notify_task_assignment ON public.tasks;
CREATE TRIGGER jacoby_notify_task_assignment
  AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_notify_task_assignment();

DROP TRIGGER IF EXISTS jacoby_notify_subtask_assignment ON public.subtasks;
CREATE TRIGGER jacoby_notify_subtask_assignment
  AFTER INSERT OR UPDATE OF assignee_id ON public.subtasks
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_notify_subtask_assignment();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
