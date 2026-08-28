import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isClient } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!user) return <Navigate to="/auth" />;
  // Os módulos de entregas e financeiro foram preservados no código, mas ficam
  // temporariamente fora da navegação. O portal passa a iniciar em Documentos.
  if (isClient && !pathname.startsWith("/portal/")) return <Navigate to="/portal/documentos" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
