# Grafana and Node-RED

Use Performance Dashboard from tools a plant may already run, without plugins of our
own. Grafana reads history through the [integration API contract](INTEGRATION_API.md)
with a read-only service token. Node-RED feeds machine readings in through an existing
[MQTT source](PRODUCTION_WORKFLOW.md#mqtt-sources) and reads summaries back through
the same contract. The dashboard stays read-only toward machines in both directions.

| Example | What it does |
| --- | --- |
| [`examples/grafana/`](../examples/grafana/) | Compose file, data source and dashboard provisioning for Grafana 13.2.5 with the [Infinity](https://grafana.com/grafana/plugins/yesoreyeram-infinity-datasource/) data source 4.1.5 (both pinned) |
| [`examples/node-red/publish-machine-json.json`](../examples/node-red/publish-machine-json.json) | Publishes one reading as JSON over `mqtts` with a pinned CA |
| [`examples/node-red/read-hourly-history.json`](../examples/node-red/read-hourly-history.json) | Reads 24 hourly summaries with a service token and keeps unknown hours unknown |

## The service token

Create one account per tool under **Settings → People & Access → Service accounts**:
role **viewer**, only the machines the tool needs, the shortest validity that works.
The token is shown once. It reads only the contract's GET endpoints and never writes
([service accounts](IDENTITY.md#service-accounts)). Keep it in the tool's environment,
never in a dashboard, flow or repository; rotate and revoke it in the same screen.
Send it over HTTPS outside a single machine: it is a bearer secret.

## Grafana

1. Set `PD_URL` (the dashboard's address, for example `https://dashboard.example`),
   `PD_SERVICE_TOKEN` and `GRAFANA_ADMIN_PASSWORD` in your shell or an untracked `.env`.
2. From `examples/grafana/`, run `docker compose up -d` and open
   `http://127.0.0.1:3300`. Grafana installs the pinned plugin version at start, which
   needs access to grafana.com once; for an offline host, install the plugin archive
   ahead of time instead.
3. Open **Dashboards → Performance Dashboard → machine history**. Choose a machine (the
   list comes from `/production/assets` and shows only granted machines) and type the
   signal's node key. The default, `ProductionCount`, matches the
   [interactive demo](INTERACTIVE_DEMO.md).

The data source sends the token only to `PD_URL` (Infinity's allowed hosts). For a
private CA, enable `tlsAuthWithCACert` as commented in the provisioning file and mount
the CA certificate.

Panels and what they deliberately do not do:

| Panel | Endpoint | Missing or bad data |
| --- | --- | --- |
| Samples | `GET /production/replay/{machine}` | A non-Good sample has `value: null` and is drawn as a gap; points more than 60 s apart are not joined |
| Samples with quality | same | Shows quality, raw value and receipt time; *Good value* is empty for non-Good samples |
| Hourly average | `GET /history/{machine}/summaries` | `average` is null unless every sample in the hour is Good with one signal identity; no point is drawn |
| Hourly samples and Good samples | same | Shows why an hour has no average |

The replay endpoint answers at most 48 hours and 2 000 samples per key; choose a shorter
range when Grafana shows a validation error or the table ends early. Summaries cover up
to 366 days. Grafana's own caching, alerting and transformations act on a copy of the
data: a transformation that fills nulls with zero invents production.

## Node-RED

Import both files with **Menu → Import**. They use core nodes only.

**Publishing readings.** In Performance Dashboard, create an MQTT source (**Commission
machine → MQTT sources**) on your `mqtts` broker with this mapping:

| Topic | Signal key | Value pointer | Timestamp pointer | Type |
| --- | --- | --- | --- | --- |
| `factory/press-1/pressure` | for example `Pressure` | `/value` | `/timestamp` | Double |

In Node-RED, set `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT` and `MQTT_CA_FILE` (path to the
broker's CA certificate) in the environment, and the broker user and password in the
broker node. Node-RED publishes with its own broker identity; the dashboard's identity
may only subscribe. Replace the *Synthetic reading* function with your machine's read
node and pass the controller's timestamp when it has one: the dashboard stores that
time as the source time and refuses a message without a timestamp. A redelivered
message is stored once.

**Reading summaries.** Set `PD_URL`, `PD_SERVICE_TOKEN`, `PD_MACHINE_ID` and
`PD_NODE_KEY`. The flow requests the last 24 hours every hour and passes on
`{ hour, average, samples, goodSamples }`. `average: null` means unknown, not zero.
A `429` (rate limit, plain text) is reported with its reset time; `401`/`403` are
reported as errors and not passed on as data.

## Not supported

- Writing to Performance Dashboard or to machines from Grafana or Node-RED. Service
  tokens are GET-only; Node-RED only publishes to the broker the dashboard reads.
- Endpoints other than the four contract reads. Browser routes can change without notice.
- Streaming or push into Grafana. Poll no faster than the data changes; summaries change
  at most hourly. Rate limits are per client IP and shared with browsers.
- MQTT wildcards, Sparkplug B and plain `mqtt://` (see [MQTT sources](PRODUCTION_WORKFLOW.md#mqtt-sources)).
- A dedicated Grafana data source plugin or Node-RED node. Both are possible later, if
  demand shows the generic Infinity queries or core flows are not enough.

## Validation

Automated: [`scripts/test-examples.mjs`](https://github.com/Sparkz400/performance_dashboard/blob/main/scripts/test-examples.mjs)
parses every Grafana and Node-RED file, refuses private keys, literal tokens and stored
flow credentials, requires core Node-RED nodes and a verified broker CA, and checks
that every request is one of the service-token contract reads. Against an owned
database it issues each Grafana query and the Node-RED request with a real viewer
token, checks every selected field exists, that a non-Good sample is `null` and its
hour has no average, and that the publish flow's JSON is accepted as a Good reading
under the documented mapping.

Manual run, 2026-10-31, Windows 11 with Docker Engine 29.9.2 (Docker Desktop): an owned database with
synthetic `ProductionCount` history (one `BadNoCommunication` sample, one 40-minute
gap), an owned TLS broker on loopback and a viewer token for one machine. Grafana
13.2.5 installed Infinity 4.1.5 from the compose file and provisioned the dashboard
without errors. In the browser, the machine list came from the token, the samples
chart left the bad sample and the gap empty, the table showed the
`BadNoCommunication` row with raw value 49 and an empty *Good value*, and the hour
containing it showed 6 samples, 5 Good and no average. Node-RED 5.0.9 loaded both
flow files unchanged through its admin API (the broker password added only to that
request), connected over `mqtts` with the pinned CA and published 21 readings; the
dashboard stored all 21 as Good with 0 refused. The read flow's debug output listed
6 hours, with the incomplete hour as `average: null, samples: 6, goodSamples: 5`.
All names and values were synthetic; no physical machine or production system was used.
