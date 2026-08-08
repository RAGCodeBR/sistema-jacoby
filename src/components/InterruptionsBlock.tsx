import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTaskInterruptions } from "@/hooks/use-board-preferences";
import type { Task } from "@/hooks/use-data";
import { toast } from "sonner";

function readableText(hex: string) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 160 ? "#0a0a0a" : "#ffffff";
}

function stop(e: { stopPropagation: () => void }) { e.stopPropagation(); }

export function InterruptionsBlock({ task, color }: { task: Task; color: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: items = [] } = useTaskInterruptions(task.id);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const count = items.length || task.interruptions || 0;
  const fg = readableText(color);

  async function save() {
    if (!user) return;
    const trimmed = reason.trim();
    const { error } = await supabase
      .from("task_interruptions")
      .insert({ task_id: task.id, user_id: user.id, reason: trimmed });
    if (error) { toast.error("Erro ao registrar"); return; }
    setReason("");
    setDialogOpen(false);
    setOpen(true);
    qc.invalidateQueries({ queryKey: ["task_interruptions", task.id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir esta interrupção?")) return;
    const { error } = await supabase.from("task_interruptions").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    qc.invalidateQueries({ queryKey: ["task_interruptions", task.id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function saveEdit(id: string) {
    const { error } = await supabase
      .from("task_interruptions")
      .update({ reason: editDraft.trim() })
      .eq("id", id);
    if (error) { toast.error("Erro ao salvar"); return; }
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["task_interruptions", task.id] });
  }

  return (
    <div className="mb-2">
      <Collapsible open={open} onOpenChange={setOpen} className="rounded border border-border/60">
        <div className="flex items-center gap-1 pr-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onPointerDown={stop}
              onClick={stop}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-0.5 text-left text-[10px] text-muted-foreground hover:text-foreground"
            >
              {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
              <Zap className="h-2.5 w-2.5" style={{ color }} />
              <span>Interrupções</span>
              <span className="ml-0.5 font-semibold" style={{ color }}>
                {count}
              </span>
            </button>
          </CollapsibleTrigger>
          <button
            type="button"
            onPointerDown={stop}
            onClick={(e) => { stop(e); setDialogOpen(true); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Registrar interrupção"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>
        <CollapsibleContent>
          {items.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Sem interrupções registradas.</p>
          ) : (
            <ul className="divide-y border-t">
              {items.map((it) => {
                const isEditing = editingId === it.id;
                return (
                  <li key={it.id} className="group/it flex items-start gap-2 px-2 py-1.5 text-[11px]">
                    <span className="shrink-0 text-[9px] text-muted-foreground" title={format(new Date(it.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}>
                      {format(new Date(it.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                    {isEditing ? (
                      <Textarea
                        value={editDraft}
                        autoFocus
                        onChange={(e) => setEditDraft(e.target.value)}
                        onPointerDown={stop}
                        onClick={stop}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(it.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-h-[40px] flex-1 resize-none p-1 text-[11px] leading-snug"
                      />
                    ) : (
                      <button
                        type="button"
                        onPointerDown={stop}
                        onClick={(e) => { stop(e); setEditingId(it.id); setEditDraft(it.reason); }}
                        className="flex-1 cursor-text whitespace-pre-wrap text-left [overflow-wrap:anywhere] hover:text-primary"
                      >
                        {it.reason || <span className="italic text-muted-foreground">Sem motivo — clique para editar</span>}
                      </button>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/it:opacity-100">
                      {isEditing ? (
                        <>
                          <button type="button" onPointerDown={stop} onClick={(e) => { stop(e); void saveEdit(it.id); }} className="rounded p-0.5 text-success hover:bg-muted" title="Salvar">
                            <Check className="h-3 w-3" />
                          </button>
                          <button type="button" onPointerDown={stop} onClick={(e) => { stop(e); setEditingId(null); }} className="rounded p-0.5 hover:bg-muted" title="Cancelar">
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onPointerDown={stop} onClick={(e) => { stop(e); setEditingId(it.id); setEditDraft(it.reason); }} className="rounded p-0.5 hover:bg-muted" title="Editar">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" onPointerDown={stop} onClick={(e) => { stop(e); void remove(it.id); }} className="rounded p-0.5 text-destructive hover:bg-destructive/10" title="Excluir">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onPointerDown={stop} onClick={stop} className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4" style={{ color }} />
              Registrar interrupção
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por que você parou? (opcional)"
            className="min-h-[90px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => void save()} style={{ background: color, color: fg }}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
