import { createFileRoute } from "@tanstack/react-router";

/**
 * Production webhook endpoint for push-based connectors (RailFeasto, future platforms).
 * Auth: `Authorization: Bearer <webhook secret>` — compared against the stored SHA-256 hash.
 */
export const Route = createFileRoute("/api/public/ingest/$sourceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        if (!/^[0-9a-f-]{36}$/i.test(params.sourceId)) return json({ error: "Not found" }, 404);
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestOrder, sha256Hex, retryDueJobs } = await import("@/lib/ingest.server");
        const { data: src } = await supabaseAdmin.from("order_sources").select("*").eq("id", params.sourceId).maybeSingle();
        const expected = (src?.config as { webhook_secret_hash?: string } | null)?.webhook_secret_hash;
        if (!src || !expected || (await sha256Hex(token)) !== expected) return json({ error: "Unauthorized" }, 401);
        if (src.status !== "connected") return json({ error: "Source paused or disconnected" }, 409);

        // Basic rate limit: 120 payloads/minute per source.
        const { count } = await supabaseAdmin.from("ingestion_jobs").select("id", { count: "exact", head: true })
          .eq("source_id", src.id).gte("created_at", new Date(Date.now() - 60_000).toISOString());
        if ((count ?? 0) > 120) return json({ error: "Rate limited" }, 429);

        let raw: unknown;
        const bodyText = await request.text();
        if (!bodyText.trim() || bodyText.length > 100_000) return json({ error: "Empty or oversized body" }, 400);
        try { raw = JSON.parse(bodyText); } catch { raw = bodyText; } // plain text (e.g. forwarded email) goes to the AI reader
        const result = await ingestOrder(supabaseAdmin, { restaurantId: src.restaurant_id, sourceId: src.id, connectorKey: src.connector_key, raw });
        await supabaseAdmin.from("order_sources").update({ last_sync_at: new Date().toISOString() }).eq("id", src.id);
        await retryDueJobs(supabaseAdmin, src.restaurant_id).catch(() => {});
        if (result.status === "failed") return json({ status: "queued_for_retry", error: "Validation failed" }, 422);
        return json(result, result.status === "created" ? 201 : 200);
      },
    },
  },
});
