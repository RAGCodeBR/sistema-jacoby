import { createFileRoute } from "@tanstack/react-router";
import { getTicketedDownload } from "@/lib/onedrive.server";

export const Route = createFileRoute("/api/onedrive/download/$itemId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const url = new URL(request.url);
          const { name, content } = await getTicketedDownload(params.itemId, url.searchParams.get("ticket"));
          return new Response(content.body, {
            headers: {
              "Content-Type": content.headers.get("content-type") || "application/octet-stream",
              "Content-Length": content.headers.get("content-length") || "",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
              "Cache-Control": "private, no-store",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível baixar o arquivo.";
          const status = error instanceof Response ? error.status : 400;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
