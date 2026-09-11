import { createFileRoute } from "@tanstack/react-router";
import { authenticateFilesRequest, createAuthorizationUrl, createFolder, deleteItem, disconnectOneDrive, getConnectionStatus, listItems, renameItem, uploadItem } from "@/lib/onedrive.server";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a ação no OneDrive.";
  const status = error instanceof Response ? error.status : 400;
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/onedrive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ownerId = await authenticateFilesRequest(request);
          const folderId = new URL(request.url).searchParams.get("folderId");
          const connection = await getConnectionStatus(ownerId);
          const items = connection ? await listItems(ownerId, folderId) : [];
          return Response.json({ connection, items });
        } catch (error) { return errorResponse(error); }
      },
      POST: async ({ request }) => {
        try {
          const ownerId = await authenticateFilesRequest(request);
          const body = await request.json() as { action?: string; name?: string; itemId?: string; parentId?: string | null; base64?: string; mimeType?: string };
          if (body.action === "connect") return Response.json({ url: await createAuthorizationUrl(ownerId) });
          if (body.action === "folder") {
            if (!body.name?.trim()) throw new Error("Informe o nome da pasta.");
            await createFolder(ownerId, body.name.trim(), body.parentId ?? null);
            return Response.json({ ok: true });
          }
          if (body.action === "rename") {
            if (!body.itemId || !body.name?.trim()) throw new Error("Informe o novo nome.");
            await renameItem(ownerId, body.itemId, body.name.trim());
            return Response.json({ ok: true });
          }
          if (body.action === "delete") {
            if (!body.itemId) throw new Error("Arquivo não identificado.");
            await deleteItem(ownerId, body.itemId);
            return Response.json({ ok: true });
          }
          if (body.action === "upload") {
            if (!body.name || !body.base64) throw new Error("Selecione o arquivo para enviar.");
            const bytes = Uint8Array.from(Buffer.from(body.base64, "base64"));
            if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("Nesta tela, envie arquivos de até 4 MB.");
            await uploadItem(ownerId, body.name, bytes, body.mimeType || "application/octet-stream", body.parentId ?? null);
            return Response.json({ ok: true });
          }
          if (body.action === "disconnect") {
            await disconnectOneDrive(ownerId);
            return Response.json({ ok: true });
          }
          throw new Error("Ação inválida.");
        } catch (error) { return errorResponse(error); }
      },
    },
  },
});
