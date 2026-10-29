# Custom widgets

A custom widget is a web page from another origin that a dashboard shows in a sandbox.
Administrators register it by its manifest URL; any editor can then add a **Custom
Widget** to a dashboard and choose what it receives.

## Manifest

```json
{
  "id": "acme.press-gauge",
  "name": "Press gauge",
  "version": "1.2.0",
  "entryUrl": "https://widgets.example.com/press-gauge/index.html",
  "permissions": ["readSeries"],
  "minW": 2, "minH": 2, "defaultW": 4, "defaultH": 6
}
```

`id` is letters, digits, `.`, `_` or `-`; `version` is a semantic version; `entryUrl`
uses http(s) and must pass the outbound address check (private addresses only with
`ALLOW_PRIVATE_OUTBOUND_URLS=true`). `permissions` may only contain `readSeries`; without
it the widget receives no data. Sizes are 1–24 grid units. Unknown keys are dropped.

## Runtime and messages

The entry page runs in an iframe with `sandbox="allow-scripts"` and no
`allow-same-origin`, so it has an opaque origin: it cannot read the dashboard page, its
storage or cookies, cannot call the application API with the viewer's session, and cannot
navigate the dashboard. The page Content-Security-Policy allows frames only from the entry
origins of active widgets.

1. The widget posts `{ "type": "pd:ready" }` to its parent.
2. The dashboard answers with
   `{ "type": "pd:series", "version": 1, "machineId": 3, "series": [{ "nodeKey": "Pressure",
   "data": [{ "timestamp": "…", "value": 51, "statusCode": "Good" }] }] }`: the last hour
   of the configured signals (at most eight) of the configured machine, read with the
   viewer's own machine access, and again every 30 seconds. A widget without `readSeries`
   gets `machineId: null` and no series.

The dashboard hears only messages from that widget's own frame. Every message other than
`pd:ready` is ignored and counted under the widget. Widgets cannot write anything.

## Versions and removal

A dashboard keeps the manifest version it was configured with. If an administrator
re-registers a new version, disables or removes the widget, the dashboard explains that
instead of rendering it; an editor reselects the widget to accept a new version.

## Limits

A widget with `readSeries` runs third-party code with the series it receives and can send
them to its own servers. Register only widgets whose authors you trust with that data.
The sandbox protects everything else (`test-custom-widgets.mjs` runs a hostile widget
that tries the page, storage, cookies, the API, navigation and requests for other data).
