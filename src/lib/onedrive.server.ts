import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { FILES_OWNER_ID } from "@/lib/files-access";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

type Connection = {
  owner_id: string;
  account_name: string | null;
  account_email: string | null;
  drive_id: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_expires_at: string;
};

export type OneDriveItem = {
  id: string;
  name: string;
  webUrl: string | null;
  size: number | null;
  lastModifiedDateTime: string | null;
  folder: { childCount?: number } | null;
  file: { mimeType?: string } | null;
};

function config() {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  const encryptionKey = process.env.ONEDRIVE_TOKEN_ENCRYPTION_KEY;
  const redirectUri = process.env.ONEDRIVE_REDIRECT_URI || "https://gestao.jacobysolucoesambientais.com.br/api/onedrive/callback";
  if (!clientId || !clientSecret || !encryptionKey) throw new Error("A conexão segura do OneDrive ainda não foi configurada no servidor.");
  return { clientId, clientSecret, encryptionKey, redirectUri };
}

function key() { return createHash("sha256").update(config().encryptionKey).digest(); }

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Credencial do OneDrive inválida.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export async function assertFilesOwner(userId: string | null | undefined) {
  if (userId !== FILES_OWNER_ID) throw new Response("Forbidden", { status: 403 });
}

export async function authenticateFilesRequest(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !publishableKey) throw new Response("Unauthorized", { status: 401 });
  const supabase = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  await assertFilesOwner(data.claims.sub);
  return data.claims.sub;
}

export async function createAuthorizationUrl(ownerId: string) {
  await assertFilesOwner(ownerId);
  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await (supabaseAdmin.from("onedrive_oauth_states" as any) as any).insert({ state, owner_id: ownerId, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: "offline_access User.Read Files.ReadWrite", state });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(`${AUTHORITY}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error_description || "Não foi possível autorizar o OneDrive.");
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function completeAuthorization(code: string, state: string) {
  const { data: stateRecord, error: stateError } = await (supabaseAdmin.from("onedrive_oauth_states" as any) as any).select("state, owner_id, expires_at").eq("state", state).maybeSingle();
  if (stateError || !stateRecord || new Date(stateRecord.expires_at).getTime() < Date.now()) throw new Error("A autorização expirou. Volte à Central de Arquivos e conecte novamente.");
  await (supabaseAdmin.from("onedrive_oauth_states" as any) as any).delete().eq("state", state);
  const { clientId, clientSecret, redirectUri } = config();
  const tokens = await tokenRequest(new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }));
  if (!tokens.refresh_token) throw new Error("O OneDrive não retornou a credencial de renovação.");
  const profileResponse = await fetch(`${GRAPH}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json().catch(() => ({}));
  const driveResponse = await fetch(`${GRAPH}/me/drive?$select=id`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const drive = await driveResponse.json().catch(() => ({}));
  const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await (supabaseAdmin.from("onedrive_connections" as any) as any).upsert({
    owner_id: stateRecord.owner_id,
    account_name: profile.displayName ?? null,
    account_email: profile.mail ?? profile.userPrincipalName ?? null,
    drive_id: drive.id ?? null,
    encrypted_access_token: encrypt(tokens.access_token),
    encrypted_refresh_token: encrypt(tokens.refresh_token),
    token_expires_at: expiresAt,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

async function connection(ownerId: string): Promise<Connection> {
  await assertFilesOwner(ownerId);
  const { data, error } = await (supabaseAdmin.from("onedrive_connections" as any) as any).select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conecte o OneDrive para acessar os arquivos.");
  return data as Connection;
}

async function accessToken(ownerId: string) {
  const record = await connection(ownerId);
  if (new Date(record.token_expires_at).getTime() > Date.now() + 60_000) return decrypt(record.encrypted_access_token);
  const { clientId, clientSecret } = config();
  const tokens = await tokenRequest(new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: decrypt(record.encrypted_refresh_token), scope: "offline_access User.Read Files.ReadWrite" }));
  const { error } = await (supabaseAdmin.from("onedrive_connections" as any) as any).update({
    encrypted_access_token: encrypt(tokens.access_token),
    encrypted_refresh_token: encrypt(tokens.refresh_token || decrypt(record.encrypted_refresh_token)),
    token_expires_at: new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return tokens.access_token;
}

async function graph(ownerId: string, path: string, init: RequestInit = {}) {
  const token = await accessToken(ownerId);
  const response = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (response.status === 204) return null;
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || "Não foi possível concluir a ação no OneDrive.");
  return json;
}

export async function getConnectionStatus(ownerId: string) {
  await assertFilesOwner(ownerId);
  const { data, error } = await (supabaseAdmin.from("onedrive_connections" as any) as any).select("account_name, account_email, connected_at").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function listItems(ownerId: string, folderId?: string | null) {
  const target = folderId ? `/me/drive/items/${encodeURIComponent(folderId)}/children` : "/me/drive/root/children";
  const result = await graph(ownerId, `${target}?$select=id,name,webUrl,size,lastModifiedDateTime,folder,file&$orderby=name`);
  return (result?.value ?? []) as OneDriveItem[];
}

export async function createFolder(ownerId: string, name: string, parentId?: string | null) {
  const target = parentId ? `/me/drive/items/${encodeURIComponent(parentId)}/children` : "/me/drive/root/children";
  return graph(ownerId, target, { method: "POST", body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }) });
}

export async function renameItem(ownerId: string, itemId: string, name: string) {
  return graph(ownerId, `/me/drive/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function deleteItem(ownerId: string, itemId: string) {
  await graph(ownerId, `/me/drive/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}

export async function uploadItem(ownerId: string, name: string, content: Uint8Array, mimeType: string, parentId?: string | null) {
  const token = await accessToken(ownerId);
  const safeName = encodeURIComponent(name);
  const target = parentId ? `/me/drive/items/${encodeURIComponent(parentId)}:/${safeName}:/content` : `/me/drive/root:/${safeName}:/content`;
  const response = await fetch(`${GRAPH}${target}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType || "application/octet-stream" }, body: content });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || "Não foi possível enviar o arquivo ao OneDrive.");
  return json;
}

export async function getItemContent(ownerId: string, itemId: string) {
  const token = await accessToken(ownerId);
  const response = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json?.error?.message || "Não foi possível carregar o arquivo.");
  }
  return response;
}

type DownloadTicket = { ownerId: string; itemId: string; name: string; expiresAt: number };

function downloadSignature(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export async function createDownloadUrl(ownerId: string, itemId: string, name: string) {
  await assertFilesOwner(ownerId);
  const payload = Buffer.from(JSON.stringify({ ownerId, itemId, name, expiresAt: Date.now() + 2 * 60 * 1000 } satisfies DownloadTicket)).toString("base64url");
  return `/api/onedrive/download/${encodeURIComponent(itemId)}?ticket=${encodeURIComponent(`${payload}.${downloadSignature(payload)}`)}`;
}

export async function getTicketedDownload(itemId: string, ticket: string | null) {
  if (!ticket) throw new Response("Unauthorized", { status: 401 });
  const separator = ticket.lastIndexOf(".");
  const payload = separator > 0 ? ticket.slice(0, separator) : "";
  const supplied = separator > 0 ? ticket.slice(separator + 1) : "";
  const expected = payload ? downloadSignature(payload) : "";
  const validSignature = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!validSignature) throw new Response("Unauthorized", { status: 401 });
  let data: DownloadTicket;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new Response("Unauthorized", { status: 401 }); }
  if (data.itemId !== itemId || data.ownerId !== FILES_OWNER_ID || data.expiresAt < Date.now()) throw new Response("Unauthorized", { status: 401 });
  return { name: data.name, content: await getItemContent(data.ownerId, itemId) };
}

export async function disconnectOneDrive(ownerId: string) {
  await assertFilesOwner(ownerId);
  const { error } = await (supabaseAdmin.from("onedrive_connections" as any) as any).delete().eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}
