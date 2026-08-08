-- Independent Jacoby workspace: required structures for notes and Kanban tasks.
CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  content_html text,
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  note_date date NOT NULL DEFAULT current_date,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes TO authenticated;
DROP POLICY IF EXISTS jacoby_client_notes_authenticated ON public.client_notes;
CREATE POLICY jacoby_client_notes_authenticated ON public.client_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS jacoby_client_notes_updated_at ON public.client_notes;
CREATE TRIGGER jacoby_client_notes_updated_at BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.client_notes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_note_attachments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_note_attachments TO authenticated;
DROP POLICY IF EXISTS jacoby_client_note_attachments_authenticated ON public.client_note_attachments;
CREATE POLICY jacoby_client_note_attachments_authenticated ON public.client_note_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time time without time zone,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_width integer CHECK (card_width IS NULL OR card_width BETWEEN 240 AND 800),
  ADD COLUMN IF NOT EXISTS interruptions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE TABLE IF NOT EXISTS public.task_collaborators (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, collaborator_id)
);
ALTER TABLE public.task_collaborators ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.task_collaborators TO authenticated;
DROP POLICY IF EXISTS jacoby_task_collaborators_authenticated ON public.task_collaborators;
CREATE POLICY jacoby_task_collaborators_authenticated ON public.task_collaborators
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.subtasks
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL;
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
