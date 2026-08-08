import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const ALL_FIELDS = [
  "tags",
  "description",
  "comments",
  "subtasks",
  "attachments",
  "interruptions",
  "priority",
  "due",
  "createdAt",
  "meta",
] as const;
export type CardField = (typeof ALL_FIELDS)[number];

export const FIELD_LABELS: Record<CardField, string> = {
  tags: "Etiquetas",
  description: "Descrição",
  comments: "Observações (seções dobráveis)",
  subtasks: "Subtarefas",
  attachments: "Arquivos externos",
  interruptions: "Interrupções",
  priority: "Prioridade",
  due: "Prazo",
  createdAt: "Data de criação",
  meta: "Responsável e ações rápidas",
};

const DEFAULT_ORDER: CardField[] = [
  "tags",
  "description",
  "comments",
  "subtasks",
  "attachments",
  "interruptions",
  "priority",
  "due",
  "createdAt",
  "meta",
];

export type KanbanOrientation = "vertical" | "horizontal";

export interface BoardPreferences {
  field_order: CardField[];
  hidden_fields: CardField[];
  interruption_color: string;
  kanban_orientation: KanbanOrientation;
}

const DEFAULT_PREFS: BoardPreferences = {
  field_order: DEFAULT_ORDER,
  hidden_fields: [],
  interruption_color: "#ef4444",
  kanban_orientation: "vertical",
};

const storageKey = (userId: string) => `jacoby-board-preferences:${userId}`;

function readLocalPreferences(userId: string | undefined): Partial<BoardPreferences> | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey(userId));
    return value ? (JSON.parse(value) as Partial<BoardPreferences>) : null;
  } catch {
    return null;
  }
}

function saveLocalPreferences(userId: string | undefined, prefs: BoardPreferences) {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
}

function migrateChips(fields: string[]): CardField[] {
  const out: CardField[] = [];
  const push = (x: CardField) => {
    if (!out.includes(x)) out.push(x);
  };
  for (const f of fields) {
    if (f === "chips") {
      (["priority", "due", "createdAt"] as CardField[]).forEach(push);
    } else if (f === "due") {
      (["due", "createdAt"] as CardField[]).forEach(push);
    } else if ((ALL_FIELDS as readonly string[]).includes(f)) {
      push(f as CardField);
    }
  }
  return out;
}

function normalize(prefs: Partial<BoardPreferences> | null | undefined): BoardPreferences {
  const rawOrder = Array.isArray(prefs?.field_order) ? (prefs!.field_order as string[]) : [];
  const order = migrateChips(rawOrder);
  const merged = [...order, ...DEFAULT_ORDER.filter((f) => !order.includes(f))];
  const rawHidden = Array.isArray(prefs?.hidden_fields) ? (prefs!.hidden_fields as string[]) : [];
  return {
    field_order: merged,
    hidden_fields: migrateChips(rawHidden),
    interruption_color: prefs?.interruption_color || DEFAULT_PREFS.interruption_color,
    kanban_orientation: prefs?.kanban_orientation === "horizontal" ? "horizontal" : "vertical",
  };
}

export function useBoardPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["board_preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BoardPreferences> => {
      if (!user) return DEFAULT_PREFS;
      const { data, error } = await supabase
        .from("board_preferences")
        .select("field_order, hidden_fields, interruption_color, kanban_orientation")
        .eq("user_id", user.id)
        .maybeSingle();
      const raw = data as Partial<BoardPreferences> | null;
      const normalized = normalize(error ? readLocalPreferences(user.id) : raw ?? readLocalPreferences(user.id));
      saveLocalPreferences(user.id, normalized);
      // Self-heal: if stored field_order differs from normalized (duplicates, missing createdAt, legacy "chips"),
      // persist the cleaned version so future reorders are stable.
      const rawOrder = Array.isArray(raw?.field_order) ? (raw!.field_order as string[]) : [];
      const rawHidden = Array.isArray(raw?.hidden_fields) ? (raw!.hidden_fields as string[]) : [];
      const orderChanged = rawOrder.length !== normalized.field_order.length || rawOrder.some((v, i) => v !== normalized.field_order[i]);
      const hiddenChanged = rawHidden.length !== normalized.hidden_fields.length || rawHidden.some((v, i) => v !== normalized.hidden_fields[i]);
      if (!error && raw && (orderChanged || hiddenChanged)) {
        void supabase
          .from("board_preferences")
          .upsert({ user_id: user.id, ...normalized }, { onConflict: "user_id" })
          .then(() => {
            qc.setQueryData(["board_preferences", user.id], normalized);
          });
      }
      return normalized;
    },
  });
}

export function useUpdateBoardPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<BoardPreferences>) => {
      if (!user) throw new Error("not authenticated");
      const current = qc.getQueryData<BoardPreferences>(["board_preferences", user.id]) ?? DEFAULT_PREFS;
      const next = { ...current, ...patch };
      const { error } = await supabase
        .from("board_preferences")
        .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
      // GitHub Pages continues to work even if a legacy project schema blocks this optional preference.
      // The browser copy is kept as a reliable fallback and is synchronized on the next successful save.
      saveLocalPreferences(user.id, next);
      if (error) return next;
      return next;
    },
    onMutate: async (patch) => {
      if (!user) return;
      const key = ["board_preferences", user.id];
      const prev = qc.getQueryData<BoardPreferences>(key) ?? DEFAULT_PREFS;
      qc.setQueryData(key, { ...prev, ...patch });
    },
    onSettled: () => {
      if (user) qc.invalidateQueries({ queryKey: ["board_preferences", user.id] });
    },
  });
}

export interface TaskInterruption {
  id: string;
  task_id: string;
  reason: string;
  created_at: string;
}

export function useTaskInterruptions(taskId: string) {
  return useQuery({
    queryKey: ["task_interruptions", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_interruptions")
        .select("id, task_id, reason, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskInterruption[];
    },
  });
}
