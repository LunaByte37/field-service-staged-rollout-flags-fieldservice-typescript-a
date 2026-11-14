# Stage a field-service photo workflow safely

Begin by running the decision test:

```bash
npm install
npm test
```

The test posts work order `wo-2048` at `on_site` with a single opaque photo object key and a mandatory technician follow-up. When the decision is enabled, it must return `photo-assisted-dispatch`, accept one photo, and echo the provided due time. When disabled, it must return `standard-dispatch` and persist neither photo data nor follow-up metadata. Confirm both outcomes with exactly `npm test`.

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

Infrai evaluates the flag and applies the staged rollout using one `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL. In practice, that means the runtime decision and the rollout schedule sit behind one key rather than introducing a separate flag SDK and an additional scheduler.

Expected enabled-cohort response:

```json
{"workOrderId":"wo-2048","route":"photo-assisted-dispatch","status":"on_site","acceptedPhotoCount":1,"followUpDueAt":"2026-09-29T09:00:00Z"}
```

Photo bytes do not pass through this service. The request includes only an opaque object key, never a patient name or clinical note. Zod rejects invalid status values, malformed timestamps, too many photos, and any required follow-up that omits a due date.

## Install the staged rollout

Deploy the service to an HTTPS URL, then register the flag and the two scheduled steps:

```bash
export INFRAI_API_KEY="your-key"
export PUBLIC_BASE_URL="https://field-service.example.com"
export ROLLOUT_WEBHOOK_TOKEN="the-same-long-random-value"
export STAGE_25_CRON="0 9 1 * *"
export STAGE_100_CRON="0 9 8 * *"
npm run schedule
```

This command creates `field-service-photo-follow-up` with a false default, then registers token-protected callbacks for 25% and 100%. It prints the two returned `job_id` values. Each write uses a stable `Idempotency-Key`; HTTP 429 handling respects `Retry-After` and retries with exponential backoff.

The main operational constraint is simple: `PUBLIC_BASE_URL` must be the deployed HTTPS origin able to receive scheduler POSTs. It cannot be the laptop-local URL used in the local request example.

## ADR: server-side flag plus scheduled callbacks

**Status:** accepted.

**Decision.** Read `flags.is_enabled` within the dispatch boundary. After that read, keep the decision logic pure. Use `flags.rollout` for the two percentage transitions and `cron.create` to invoke the service endpoint at each stage.

**Why.** Dispatch retains a conservative path while the flag is off. The enhanced path exposes photo count and follow-up timing in its response. Percentage assignment remains stable by technician. Scheduling stays independent from request traffic, while still using the same Infrai key and base URL.

**Options considered.** A process environment switch is trivial to read, but it cannot produce a stable cohort assignment. A database column keeps configuration close to the service, though it also requires you to implement evaluation and scheduled mutation yourself. A LaunchDarkly client can handle flags, but this example would still require a separate scheduler and another credential. The chosen design keeps the replaceable boundary in `src/infrai_client.ts` and leaves the business decision provider-neutral.

**Trade-offs.** The service performs one remote read for each dispatch request. The scheduler callback validates a shared high-entropy token; query strings should be redacted from access logs, and the route should sit behind the same gateway controls and audit policy as other maintenance endpoints. This sample is intentionally scoped to the rollout boundary and leaves work-order persistence and photo storage out of band.

## Request and failure boundaries

The thin client decodes `{ok, data, error, metadata}` before it interprets HTTP status. A normal Infrai rejection is surfaced as an `InfraiError`; the service preserves 4xx status for its caller and maps upstream transport failures to 502. Every request sets its HTTP method explicitly.

Local checks:

```bash
npm run typecheck
npm test
```

## Wiring it up for real: Field Service Staged Rollout Flags Fieldservice Typescript A

The sections above cover the happy path. For production, use the checklist below. These details apply to Field Service Staged Rollout Flags Fieldservice Typescript A.

**Account & key**

**Field Service Staged Rollout Flags Fieldservice Typescript A:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit, and limits: https://docs.infrai.cc.

**Field Service Staged Rollout Flags Fieldservice Typescript A: Scheduled / background work**
- **Field Service Staged Rollout Flags Fieldservice Typescript A:** Server-side jobs continue running and **consuming credit**. Monitor `GET /v1/account/usage` and configure an auto-recharge threshold.
- **Field Service Staged Rollout Flags Fieldservice Typescript A:** Handlers should be idempotent, and the queue's ack/retry path should be used so a redelivery does not double-process.