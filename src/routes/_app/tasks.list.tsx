import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useTasks,
  useColumns,
  useClients,
  useProfiles,
  useSubtasks,
  useTaskCollaborators,
  type Task,
} from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { TaskFilters, applyTaskFilters, type TaskFilterValue } from "@/components/TaskFilters";
import { TaskDialog } from "@/components/TaskDialog";
import { priorityColors, priorityLabels } from "@/lib/task-utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tasks/list")({
  component: ListPage,
  validateSearch: (s: Record<string, unknown>) => ({
    task: typeof s.task === "string" ? s.task : undefined,
    mine: s.mine === "1" || s.mine === true || s.mine === "true" ? true : undefined,
  }),
});

function ListPage() {
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: profiles = [] } = useProfiles();
  const { data: subtasks = [] } = useSubtasks();
  const { data: collaborators = [] } = useTaskCollaborators();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TaskFilterValue>(() =>
    search.mine ? { scope: "mine" } : {},
  );
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Auto-open a task when arriving with ?task=<id>
  useEffect(() => {
    if (!search.task) return;
    const t = tasks.find((x) => x.id === search.task);
    if (t) {
      setEdit(t);
      setOpen(true);
      navigate({
        to: "/tasks/list",
        search: (p: any) => ({ ...p, task: undefined }),
        replace: true,
      });
    }
  }, [search.task, tasks, navigate]);

  const subtaskAssigneeTaskIds = useMemo(() => {
    const s = new Set<string>();
    if (!user?.id) return s;
    for (const st of subtasks as any[])
      if (st.assignee_id === user.id && st.task_id) s.add(st.task_id);
    return s;
  }, [subtasks, user?.id]);

  const subtaskAssigneeTaskIdsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const st of subtasks as any[]) {
      if (!st.assignee_id || !st.task_id) continue;
      const set = map.get(st.assignee_id) ?? new Set<string>();
      set.add(st.task_id);
      map.set(st.assignee_id, set);
    }
    return map;
  }, [subtasks]);

  const collaboratorTaskIds = useMemo(
    () => new Set(collaborators.filter((collaborator) => collaborator.collaborator_id === user?.id).map((collaborator) => collaborator.task_id)),
    [collaborators, user?.id],
  );

  const list = useMemo(() => {
    const r = applyTaskFilters(tasks, filters, {
      userId: user?.id ?? null,
      subtaskAssigneeTaskIds,
      collaboratorTaskIds,
      subtaskAssigneeTaskIdsByUser,
    });
    return r.filter((task) => task.status !== "done" && !task.completed_at).sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [tasks, filters, user?.id, subtaskAssigneeTaskIds, collaboratorTaskIds, subtaskAssigneeTaskIdsByUser]);

  const completeTask = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      toast.error(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Tarefa concluída.");
  };

  const moveToTrash = async (task: Task) => {
    if (!confirm(`Mover a tarefa “${task.title}” para a lixeira?`)) return;
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq("id", task.id);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success("Tarefa movida para a lixeira.");
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      checked ? next.add(taskId) : next.delete(taskId);
      return next;
    });
  };

  const selectAllVisibleTasks = (checked: boolean) => {
    setSelectedTaskIds(checked ? new Set(list.map((task) => task.id)) : new Set());
  };

  const moveSelectedToTrash = async () => {
    const ids = [...selectedTaskIds].filter((id) => list.some((task) => task.id === id));
    if (!ids.length) return;
    if (!confirm(`Mover ${ids.length} tarefa(s) selecionada(s) para a lixeira?`)) return;

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .in("id", ids);
    if (error) return toast.error(error.message);

    setSelectedTaskIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success(`${ids.length} tarefa(s) movida(s) para a lixeira.`);
  };

  const allVisibleSelected = list.length > 0 && list.every((task) => selectedTaskIds.has(task.id));

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-end gap-3 flex-wrap">
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova tarefa
        </Button>
      </header>
      <TaskFilters filters={filters} onChange={setFilters} />

      {selectedTaskIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span>{selectedTaskIds.size} tarefa(s) selecionada(s)</span>
          <Button size="sm" variant="destructive" onClick={() => void moveSelectedToTrash()}>
            <Trash2 className="mr-2 h-4 w-4" />Mover para a lixeira
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 border-r px-2 py-2 text-center">
                <Checkbox
                  aria-label="Selecionar todas as tarefas visíveis"
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => selectAllVisibleTasks(checked === true)}
                />
              </th>
              <th className="w-[29%] border-r px-2 py-2">Tarefa</th>
              <th className="w-[11%] border-r px-2 py-2">Cliente</th>
              <th className="w-[13%] border-r px-2 py-2">Responsável</th>
              <th className="w-[12%] border-r px-2 py-2">Colaboradores</th>
              <th className="w-[10%] border-r px-2 py-2">Status</th>
              <th className="w-[10%] border-r px-2 py-2">Prioridade</th>
              <th className="w-[10%] border-r px-2 py-2">Prazo</th>
              <th className="w-[5%] px-1 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground">
                  Nenhuma tarefa
                </td>
              </tr>
            ) : list.map((t) => {
              const client = clients.find((c) => c.id === t.client_id);
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const statusColumn = columns.find((column) => column.id === t.column_id);
              const overdue = t.due_date && isPast(new Date(t.due_date)) && t.status !== "done";
              const taskCollaborators = collaborators.filter((collaborator) => collaborator.task_id === t.id).map((collaborator) => profiles.find((profile) => profile.id === collaborator.collaborator_id)).filter(Boolean);

              return (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => {
                    setEdit(t);
                    setOpen(true);
                  }}
                >
                  <td className="border-r px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Selecionar tarefa ${t.title}`}
                      checked={selectedTaskIds.has(t.id)}
                      onCheckedChange={(checked) => toggleTaskSelection(t.id, checked === true)}
                    />
                  </td>
                  <td className="border-r px-2 py-2 font-medium"><span className="block truncate">{t.title}</span></td>
                  <td className="border-r px-2 py-2">
                    {client ? (
                      <Badge variant="outline" style={{ borderColor: client.color ?? undefined }}>
                        {client.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="border-r px-2 py-2 text-muted-foreground">
                    {assignee?.full_name || assignee?.email || "—"}
                  </td>
                  <td className="border-r px-2 py-2">
                    {taskCollaborators.length > 0 ? (
                      <div className="flex -space-x-1" title={taskCollaborators.map((p: any) => p.full_name || p.email).join(", ")}>
                        {taskCollaborators.slice(0, 3).map((person: any) => {
                          const name = person.full_name || person.email || "Usuário";
                          return <Avatar key={person.id} className="h-5 w-5 border border-background"><AvatarImage src={person.avatar_url || undefined} alt={name} /><AvatarFallback className="text-[8px]">{name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>;
                        })}
                        {taskCollaborators.length > 3 ? <span className="ml-1 text-[10px] text-muted-foreground">+{taskCollaborators.length - 3}</span> : null}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="border-r px-2 py-2">
                    {statusColumn ? (
                      <Badge variant="outline" className="max-w-full truncate" style={{ borderColor: statusColumn.color || undefined, color: statusColumn.color || undefined }}>
                        {statusColumn.name}
                      </Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="border-r px-2 py-2">
                    {t.priority ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: priorityColors[t.priority],
                          color: priorityColors[t.priority],
                        }}
                      >
                        {priorityLabels[t.priority]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`border-r px-2 py-2 whitespace-nowrap ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    {t.due_date
                      ? `${format(new Date(t.due_date), "dd MMM yyyy", { locale: ptBR })}${t.due_time ? ` · ${t.due_time.slice(0, 5)}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Concluir tarefa"
                      disabled={t.completed_at !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        void completeTask(t.id);
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Mover para a lixeira"
                      className="text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveToTrash(t);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
    </div>
  );
}
