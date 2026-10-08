import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function requireMgr(ctx: Ctx, restaurantId: string) {
  const { data, error } = await ctx.supabase.rpc("has_any_role", { _rid: restaurantId, _roles: ["owner", "manager"] });
  if (error || !data) throw new Error("Permission denied");
}
async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const clientKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Gmail connection is not configured yet.");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const g = await import("./gmail.server");
    const request = getRequest();
    const url = new URL(request.url);
    const fwd = url.hostname === "localhost" ? ((request.headers.get("x-forwarded-host") ?? "").split(",")[0] ?? "").trim().toLowerCase() : "";
    const sandboxHost = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(lovable\.app|lovableproject\.com|lovable\.dev)$/.test(fwd) ? fwd : null;
    const returnUrl = new URL("/api/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const a = await admin();
    const { data: acct } = await a.from("connected_email_accounts").select("connection_key_ciphertext").eq("restaurant_id", data.restaurantId).maybeSingle();
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: g.GATEWAY_BASE_URL, connectorId: g.GMAIL_CONNECTOR, appUserId: context.userId, clientAPIKey: clientKey, returnUrl,
      connectionAPIKey: acct ? g.decryptKey(acct.connection_key_ciphertext) : undefined,
      credentialsConfiguration: { scopes: g.GMAIL_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid, code: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const g = await import("./gmail.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(g.GATEWAY_BASE_URL, data.code);
    if (connectorId !== g.GMAIL_CONNECTOR) throw new Error("Wrong connector returned");
    const prof = await callAsAppUser({ gatewayBaseUrl: g.GATEWAY_BASE_URL, connectionAPIKey, connectorId, path: "/gmail/v1/users/me/profile", requiredScopes: g.GMAIL_SCOPES });
    if (!prof.ok) throw new Error(`Could not read Gmail profile (${prof.status})`);
    const email = ((await prof.json()).emailAddress as string) ?? null;
    const a = await admin();
    const { data: src, error: se } = await a.from("order_sources").upsert({
      restaurant_id: data.restaurantId, connector_key: "gmail_api", display_name: "Gmail", environment: "production",
      status: "connected", health: "healthy", last_error: null, connected_account: email,
    }, { onConflict: "restaurant_id,connector_key,display_name" }).select("id").single();
    if (se) throw new Error(se.message);
    const { error } = await a.from("connected_email_accounts").upsert({
      restaurant_id: data.restaurantId, connected_by: context.userId, email_address: email, source_id: src.id,
      connection_key_ciphertext: g.encryptKey(connectionAPIKey), connection_status: "connected", last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "restaurant_id" });
    if (error) throw new Error(error.message);
    await a.from("audit_logs").insert({ restaurant_id: data.restaurantId, actor_id: context.userId, action: "gmail.connected", entity: "connected_email_accounts", entity_id: src.id, meta: { email } as never });
    return { email };
  });

export const gmailStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const a = await admin();
    const { data: acct } = await a.from("connected_email_accounts")
      .select("email_address, connection_status, last_checked_at, emails_processed, last_error").eq("restaurant_id", data.restaurantId).maybeSingle();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { count } = await a.from("imported_emails").select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId).eq("processing_status", "imported").gte("created_at", start.toISOString());
    return { configured: !!process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"], account: acct ?? null, ordersToday: count ?? 0 };
  });

export const syncGmailNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const { syncGmailForRestaurant } = await import("./gmail.server");
    return syncGmailForRestaurant(await admin(), data.restaurantId);
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const a = await admin();
    const g = await import("./gmail.server");
    const { data: acct } = await a.from("connected_email_accounts").select("*").eq("restaurant_id", data.restaurantId).maybeSingle();
    if (!acct) return { ok: true };
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    await disconnectAppUser({ gatewayBaseUrl: g.GATEWAY_BASE_URL, connectionAPIKey: g.decryptKey(acct.connection_key_ciphertext), connectorId: g.GMAIL_CONNECTOR })
      .catch((e) => console.error("Gmail gateway disconnect failed", e));
    await a.from("connected_email_accounts").delete().eq("id", acct.id);
    if (acct.source_id) await a.from("order_sources").update({ status: "not_connected", health: "unknown", connected_account: null }).eq("id", acct.source_id);
    await a.from("audit_logs").insert({ restaurant_id: data.restaurantId, actor_id: context.userId, action: "gmail.disconnected", entity: "connected_email_accounts", entity_id: acct.id, meta: {} as never });
    return { ok: true };
  });

export const ignoreImportedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid, id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMgr(context, data.restaurantId);
    const a = await admin();
    await a.from("imported_emails").update({ processing_status: "ignored" }).eq("id", data.id).eq("restaurant_id", data.restaurantId);
    return { ok: true };
  });
