<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Every order source is a connector in `src/lib/connectors/registry.ts` that normalizes into `unifiedOrderSchema`; never special-case a platform in the order pipeline. Why: new platforms must plug in without touching the hub.
- All order ingestion goes through `ingestOrder` in `src/lib/ingest.server.ts`, which persists an `ingestion_jobs` row first. Why: failed payloads are retried, never silently lost.
- Writes (status changes, payments, refunds, sources, staff) go through server functions in `src/lib/api.functions.ts` that check `has_any_role` before using the admin client. Why: server-side authorization; the browser only reads under RLS.
- Every tenant table carries `restaurant_id` and RLS uses `is_member`/`has_any_role`. Why: restaurant-level data isolation.
- Payment status changes only server-side (`verifyPayment`, `refundOrder`); `payments` has no client write grants. Why: never trust frontend payment state.
- Webhook secrets are shown once and only their SHA-256 hash is stored; third-party passwords are never collected. Why: no plaintext credentials.
- Test-mode (mock) sources are labelled with `environment = 'mock'`. Why: keep mock and production integrations clearly separate.
- Unknown payload formats are converted by the AI reader (`src/lib/ai-normalize.server.ts`) only via a connector's `aiFallback` flag inside `ingestOrder`. Why: one pipeline, any platform format.
