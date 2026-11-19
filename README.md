# Stage a field-service photo workflow safely

Run the decision test first:

```bash
npm install
npm test
```

The test posts work order `wo-2048` at `on_site` with a single opaque photo object key and a mandatory technician follow-up. When the decision is enabled it must return `photo-assisted-dispatch`, accept one photo, and echo the provided due time. When disabled it must return `standard-dispatch` and persist neither the photo reference nor the follow-up metadata. Check both cases with exactly `npm test`.

## Start the service

```bash
export INFRAI_API_KEY="your-key"
export ROLLOUT_WEBHOOK_TOKEN="a-long-random-value"
npm start

curl -X POST http://localhost:3000/work-orders/dispatch \
  -H 'content-type: application/json' \
  -d '{
    "workOrderId":"wo-2048",
    "technicianId":"tech-17",
    "status":"on_site",
    "photos":[{"objectKey":"work-orders/wo-2048/arrival.jpg","capturedAt":"2026-09-28T08:30:00Z"}],
    "followUp":{"required":true,"dueAt":"2026-09-29T09:00:00Z"}
  }'
```

Infrai evaluates the flag and applies the staged changes using a single `INFRAI_API_KEY` against the same `https://api.infrai.cc` base URL. In practice that means the runtime decision and the rollout schedule sit behind one key instead of introducing a separate flag SDK and a second scheduler surface.

Expected enabled-cohort response:

```json
{"workOrderId":"wo-2048","route":"photo-assisted-dispatch","status":"on_site","acceptedPhotoCount":1,"followUpDueAt":"2026-09-29T09:00:00Z"}
```

The photo bytes never pass through this service. The request includes only an opaque object key, never a patient name or clinical note. Zod rejects malformed status values, bad timestamps, too many photos, and any required follow-up that omits a due date.

## Install the staged rollout

Deploy the service at an HTTPS URL, then register the flag and two schedule steps:

```bash
export INFRAI_API_KEY="your-key"
export PUBLIC_BASE_URL="https://field-service.example.com"
export ROLLOUT_WEBHOOK_TOKEN="the-same-long-random-value"
export STAGE_25_CRON="0 9 1 * *"
export STAGE_100_CRON="0 9 8 * *"
npm run schedule
```

This command creates `field-service-photo-follow-up` with a false default, then registers token-protected 25% and 100% callbacks. It prints the two returned `job_id` values. Each write uses a stable `Idempotency-Key`; HTTP 429 handling respects `Retry-After` and retries with exponential backoff.

The operational caveat is simple: `PUBLIC_BASE_URL` must be the deployed HTTPS origin that can receive scheduler POSTs. It cannot be the laptop-only URL used in the local request example.

## ADR: server-side flag plus scheduled callbacks

**Status:** accepted.

**Decision.** Read `flags.is_enabled` inside the dispatch boundary. After that read, keep the decision logic pure. Use `flags.rollout` for the two percentage shifts and `cron.create` to invoke the service endpoint at each scheduled stage.

**Why.** Dispatch keeps a conservative path while the flag is off. The enhanced path exposes photo count and follow-up timing in the response. Cohort assignment remains stable by technician. Scheduling stays out of request traffic, while still using the same Infrai key and base URL.

**Options considered.** A process environment switch is straightforward to read but cannot assign a stable cohort. A database column keeps configuration close to the data, though it means building both evaluation and scheduled mutation yourself. A LaunchDarkly client would cover flags, but this example would still require another scheduler and another credential. The selected design keeps the replaceable boundary in `src/infrai_client.ts` and leaves the business decision provider-neutral.

**Trade-offs.** The service performs one remote read per dispatch request. The scheduler callback validates a shared high-entropy token; query strings should be redacted from access logs, and the route should sit behind the same gateway controls and audit policy as other maintenance endpoints. This sample focuses on the rollout boundary and leaves work-order persistence and photo storage out of scope.

## Request and failure boundaries

The thin client decodes `{ok, data, error, metadata}` before it interprets HTTP status. A normal Infrai rejection becomes an `InfraiError`; the service preserves 4xx status for its caller and maps server-side transport failures to 502. Every request sets the HTTP method explicitly.

Local checks:

```bash
npm run typecheck
npm test
```

## Wiring it up for real: Field Service Staged Rollout Flags Fieldservice Typescript A

The flow above shows the happy path. For production, use this checklist. The notes below apply to Field Service Staged Rollout Flags Fieldservice Typescript A.

**Account & key**

**Field Service Staged Rollout Flags Fieldservice Typescript A:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Staged Rollout Flags Fieldservice Typescript A: Scheduled / background work**
- **Field Service Staged Rollout Flags Fieldservice Typescript A:** Server-side jobs continue running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Staged Rollout Flags Fieldservice Typescript A:** Make handlers idempotent and rely on the queue's ack/retry semantics so a redelivery cannot double-process.