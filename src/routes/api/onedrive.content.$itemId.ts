import { createFileRoute } from "@tanstack/react-router";
import { authenticateFilesRequest, getItemContent } from "@/lib/onedrive.server";

export const Route = createFileRoute("/api/onedrive/content/$itemId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const ownerId = await authenticateFilesRequest(request);
          const content = await getItemContent(ownerId, params.itemId);
          return new Response(content.body, {
            headers: {
              "Content-Type": content.headers.get("content-type") || "application/octet-stream",
              "Content-Length": content.headers.get("content-length") || "",
              "Cache-Control": "private, no-store",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível carregar o arquivo.";
          const status = error instanceof Response ? error.status : 400;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
