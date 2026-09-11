import { createFileRoute } from "@tanstack/react-router";
import { completeAuthorization } from "@/lib/onedrive.server";

export const Route = createFileRoute("/api/onedrive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const destination = new URL("/arquivos", url.origin);
        if (error || !code || !state) {
          destination.searchParams.set("onedrive", "cancelled");
          return Response.redirect(destination, 303);
        }
        try {
          await completeAuthorization(code, state);
          destination.searchParams.set("onedrive", "connected");
        } catch (err) {
          console.error("[OneDrive] OAuth callback failed", err);
          destination.searchParams.set("onedrive", "error");
        }
        return Response.redirect(destination, 303);
      },
    },
  },
});
