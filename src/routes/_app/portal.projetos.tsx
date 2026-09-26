import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CircleAlert, CircleCheck, ClipboardList } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/portal/projetos")({ component: ClientProjectsPage });

type ProjectTask = { id: string; title: string; description: string | null; status: "todo" | "in_progress" | "review" | "done" | null; column_id: string | null; priority: "low" | "medium" | "high" | "urgent" | null; due_date: string | null; position: number; created_at: string };
type Column = { id: string; name: string; color: string | null; position: number };

const fallbackColumns = [
  { id: "todo", name: "A fazer", color: "#64748b", position: 1 },
  { id: "in_progress", name: "Em andamento", color: "#2563eb", position: 2 },
  { id: "review", name: "Em revisão", color: "#d97706", position: 3 },
  { id: "done", name: "Concluídas", color: "#16a34a", position: 4 },
];
const statusFor = (task: ProjectTask) => task.status === "done" ? "done" : task.status || "todo";
const priorityLabel: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

function ClientProjectsPage() {
  const { clientId } = useAuth();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["client-project-tasks", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tasks") as any).select("id,title,description,status,column_id,priority,due_date,position,created_at").eq("client_id", clientId).is("deleted_at", null).order("position").order("created_at");
      if (error) throw error;
      return (data ?? []) as ProjectTask[];
    },
  });
  const { data: configuredColumns = [] } = useQuery({
    queryKey: ["client-project-columns", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("kanban_columns") as any).select("id,name,color,position").order("position");
      if (error) throw error;
      return (data ?? []) as Column[];
    },
  });
  const columns = useMemo(() => {
    const visible = configuredColumns.filter((column) => tasks.some((task) => task.column_id === column.id));
    return visible.length ? [...visible, fallbackColumns[3]] : fallbackColumns;
  }, [configuredColumns, tasks]);
  const grouped = useMemo(() => columns.map((column) => ({ column, tasks: tasks.filter((task) => column.id === "done" ? statusFor(task) === "done" : column.id === task.column_id || (!task.column_id && statusFor(task) === column.id)) })), [columns, tasks]);

  return <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6"><header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Gestão de projetos</h1><p className="text-sm text-muted-foreground">Acompanhe o andamento das tarefas da sua empresa. Esta área é somente para visualização.</p></header>{isLoading ? <Card className="p-8 text-sm text-muted-foreground">Carregando tarefas...</Card> : <div className="flex gap-4 overflow-x-auto pb-4">{grouped.map(({ column, tasks: columnTasks }) => <section key={column.id} className="w-80 shrink-0"><div className="mb-3 flex items-center gap-2 px-1"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color || "#64748b" }} /><h2 className="font-semibold">{column.name}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{columnTasks.length}</span></div><div className="min-h-40 space-y-3 rounded-xl border bg-muted/25 p-3">{columnTasks.map((task) => <ProjectCard key={task.id} task={task} />)}{!columnTasks.length && <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma tarefa nesta etapa.</p>}</div></section>)}</div>}</div>;
}

function ProjectCard({ task }: { task: ProjectTask }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.due_date && task.due_date < today && statusFor(task) !== "done";
  return <Card className="p-4 shadow-sm"><div className="flex gap-2"><ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h3 className="font-medium leading-snug">{task.title}</h3>{task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>}</div></div><div className="mt-4 flex flex-wrap gap-2 text-xs">{task.priority && <span className="rounded-full bg-muted px-2 py-1">Prioridade {priorityLabel[task.priority]}</span>}{task.due_date && <span className={`flex items-center gap-1 rounded-full px-2 py-1 ${overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{overdue ? <CircleAlert className="h-3.5 w-3.5" /> : statusFor(task) === "done" ? <CircleCheck className="h-3.5 w-3.5 text-primary" /> : <CalendarDays className="h-3.5 w-3.5" />}{overdue ? "Prazo vencido" : `Prazo ${new Date(`${task.due_date}T12:00:00`).toLocaleDateString("pt-BR")}`}</span>}</div></Card>;
}
