import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAuthorizationUrl, createFolder, deleteItem, disconnectOneDrive as disconnectOneDriveAccount, getConnectionStatus, listItems, renameItem } from "@/lib/onedrive.server";

const itemSchema = z.object({ itemId: z.string().min(1) });
const folderSchema = z.object({ name: z.string().trim().min(1).max(180), parentId: z.string().min(1).nullable().optional() });
const renameSchema = itemSchema.extend({ name: z.string().trim().min(1).max(180) });

function owner(context: unknown) { return (context as { userId?: string }).userId ?? null; }

export const getOneDriveStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => getConnectionStatus(owner(context)));
export const connectOneDrive = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(({ context }) => createAuthorizationUrl(owner(context)!));
export const getOneDriveItems = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { folderId?: string | null }) => z.object({ folderId: z.string().min(1).nullable().optional() }).parse(input)).handler(({ data, context }) => listItems(owner(context)!, data.folderId));
export const createOneDriveFolder = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => folderSchema.parse(input)).handler(({ data, context }) => createFolder(owner(context)!, data.name, data.parentId));
export const renameOneDriveItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => renameSchema.parse(input)).handler(({ data, context }) => renameItem(owner(context)!, data.itemId, data.name));
export const deleteOneDriveItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => itemSchema.parse(input)).handler(({ data, context }) => deleteItem(owner(context)!, data.itemId));
export const disconnectOneDrive = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(({ context }) => disconnectOneDriveAccount(owner(context)!));
