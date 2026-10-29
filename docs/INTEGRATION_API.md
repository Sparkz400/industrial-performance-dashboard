# Integration API contract (v1)

This is the supported, bounded surface for systems that read from the dashboard or
receive its events. Other `/api/v1` routes and every tRPC procedure serve the
browser application; they can change without notice and are not part of this
contract. Integrations must not depend on them.

Contract evidence: [`scripts/test-api-contract.mjs`](https://github.com/Sparkz400/performance_dashboard/blob/main/scripts/test-api-contract.mjs)
runs the published example client
[`scripts/examples/integration-client.mjs`](https://github.com/Sparkz400/performance_dashboard/blob/main/scripts/examples/integration-client.mjs)
against an owned database. Outbound events are covered by
[`scripts/test-integration-outbox.mjs`](https://github.com/Sparkz400/performance_dashboard/blob/main/scripts/test-integration-outbox.mjs).

## Access

- Use a dedicated, named account per integration with the lowest role that works
  (`viewer` for read endpoints, `supervisor` for work-order completions) and grant
  only the machines it needs. Responses are filtered or refused by those grants.
- Authentication is the same session as the browser: `GET /api/v1/csrf-token`,
  then `POST /api/v1/auth/login` with the `x-csrf-token` header, then keep the
  returned session cookie. Sessions end on logout, password, role or account
  changes; log in again on `401`.
- Alternatively, a [service account](IDENTITY.md#service-accounts) sends
  `Authorization: Bearer pdsa_…` on the read endpoints below: no session, no CSRF
  token, its own machine grants, GET only. Expired or revoked tokens get `401`.

## Read endpoints

All instants are ISO 8601 with an explicit offset (`Z` or `±hh:mm`). Missing or bad
data is never filled in: values from non-Good samples are `null`, and averages are
`null` unless every sample in the bucket is Good with one signal identity.

| Endpoint | Role | Bounds | Returns |
| --- | --- | --- | --- |
| `GET /api/v1/production/assets` | viewer | granted machines only | `[{ id, name, status }]` |
| `GET /api/v1/history/{machineId}/summaries?nodeKey&start&end` | viewer | end > start, at most 366 days; at most 8 785 hourly rows | `[{ bucket, samples, good, sum, min, max, average, identity, corrected_samples, retained_samples, source, continuity, retained_state_seconds, retained_increment, retained_increment_pairs, retained_unknown_pairs }]` |
| `GET /api/v1/production/replay/{machineId}?start&end&keys=…` | viewer | at most 48 hours; 1–8 distinct keys; 2 000 samples per key (`truncated: true` beyond) | `incident-replay-v1`: per key `{ at, sourceAt, receivedAt, value, raw, quality, identity }`, plus alarms and operator events in the window |
| `GET /api/v1/work-orders/machines/{machineId}/completions` | supervisor | latest 100 imported orders (`truncated` beyond) | `work-order-completions-v1`: per order the saved report revision, digest and reconciled or unverified facts |

There is no cursor pagination. Page by time: request consecutive windows within the
bounds above and repeat a window whose result reports `truncated: true` with a
shorter span.

## Errors

Application errors (400–404, 5xx) use one body; `429` from the rate limiter is plain
text and the recovery-preview `503` carries only `error`:

```json
{ "status": "error", "error": "Machine access denied", "code": "FORBIDDEN", "requestId": "…" }
```

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad parameters or a window beyond the bounds; `details` may list fields |
| 401 | `UNAUTHORIZED` | No valid session; log in again |
| 403 | `FORBIDDEN` / `INVALID_CSRF_TOKEN` | Role or machine grant missing, or CSRF token missing on a write |
| 404 | `NOT_FOUND` | Unknown record |
| 429 | — | Rate limit reached; wait until `RateLimit-Reset` seconds |
| 503 | — | Recovery preview is read-only, or the service is not ready |

Quote `requestId` when reporting a problem; it matches the server log entry.

## Rate limits

Each client IP has `RATE_LIMIT_MAX_REQUESTS` requests per `RATE_LIMIT_WINDOW_MS`
(default 1 000 per 15 minutes), shared with any browser on the same address.
Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
Poll no faster than the data changes; summaries change at most hourly.

## Outbound events (webhooks)

Administrators subscribe a destination under **Settings → Webhooks** to
`alarm.triggered`, `alarm.cleared` or `cmms.handoff`. Events come from a durable
outbox written in the same transaction as the alarm or handoff:

- Body: `{ id, schemaVersion, type, payload, timestamp }`, signed with
  HMAC-SHA256 over the exact body in `X-Webhook-Signature`. `id` (also
  `X-Webhook-Delivery-Id`) is stable across retries and requeues; **deduplicate
  on it**. `X-Webhook-Schema-Version` repeats `schemaVersion` (currently 1).
- Delivery is at least once. A crash after sending and before recording the
  result resends the identical body.
- Failures retry with exponential delay capped at 15 minutes. After 100 failed
  attempts (about a day) the delivery stops, an `Integration delivery stopped`
  incident opens and administrators can inspect
  (`GET /api/v1/webhooks/deliveries/{id}`) and requeue it
  (`POST /api/v1/webhooks/deliveries/{id}/requeue`, audited). Nothing is deleted.
- Destinations must pass the outbound URL checks; private addresses need
  `ALLOW_PRIVATE_OUTBOUND_URLS=true`.

## Version policy

- `v1` changes are additive only: new endpoints, new optional parameters and new
  response fields. Ignore fields you do not know.
- Removing or renaming a field, tightening a bound or changing a meaning needs a
  new path (`/api/v2/…`) or a new payload `revision`/`version`/`schemaVersion`.
  The previous version stays available for at least one release, with the change
  listed in the release notes.
- A webhook schema change raises `schemaVersion`. Queued events keep the version
  they were written with.
