import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy address retained only to avoid broken bookmarks. The module lives under Portal do Cliente. */
export const Route = createFileRoute("/_app/residuos")({
  beforeLoad: () => { throw redirect({ to: "/portal/residuos" }); },
});
