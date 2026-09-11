import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Cloud, FileUp, FolderOpen, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/arquivos")({ component: FilesPage });

function FilesPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Central de documentos</p>
        <h1 className="text-2xl font-bold tracking-tight">Arquivos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acesse as pastas da empresa em um único lugar, com sincronização direta com o OneDrive.
        </p>
      </header>

      <Card className="overflow-hidden border-primary/20">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Cloud className="h-6 w-6" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">OneDrive</h2><Badge variant="secondary">Aguardando conexão</Badge></div>
              <p className="mt-1 text-sm text-muted-foreground">Nenhuma conta Microsoft foi vinculada ao sistema ainda.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Info icon={FolderOpen} title="Pastas e arquivos" description="Navegue pela estrutura real do OneDrive, sem criar cópias no sistema." />
          <Info icon={FileUp} title="Alterações sincronizadas" description="Envios, renomeações e exclusões feitos aqui também acontecem no OneDrive." />
          <Info icon={ShieldCheck} title="Exclusão segura" description="Arquivos removidos irão primeiro para a lixeira do OneDrive." />
        </div>
      </Card>

      <Card className="p-8 text-center">
        <FolderOpen className="mx-auto h-9 w-9 text-primary" />
        <h2 className="mt-3 font-semibold">Conecte o OneDrive para começar</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Assim que a conta Microsoft da Jacoby for autorizada, esta tela exibirá suas pastas, arquivos e as ações de criar, enviar, editar, mover e excluir.
        </p>
      </Card>
    </div>
  );
}

function Info({ icon: Icon, title, description }: { icon: typeof FolderOpen; title: string; description: string }) {
  return <div className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}
