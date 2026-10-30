# Performance Dashboard interface

This interface serves industrial monitoring and full administration on desktops,
tablets and phones. Preserve Figtree, graphite/grey surfaces, orange actions and
the existing light and dark themes. Operational clarity takes priority over
decoration. The approved direction is a restrained data terminal.

## Layout and navigation

- Desktop navigation is 224px wide with labels and expandable secondary groups.
- Below 1100px, Overview, Machines (Production for non-administrators), Operations
  and More form the bottom navigation. More contains every role-permitted route.
- Page gutters are 16px on phones and 24px on desktop. Page titles use 26px Figtree.
- The home route is the shift overview. Custom dashboards remain at `/dashboards`
  and `/dashboard/:id`; saved widget layouts are unchanged by phone viewing.
- Operations groups planning, maintenance, analysis, history, connections and
  assets. Settings uses a side list on desktop and a labelled selector on phones.
- Machine configuration fills the page. Fields scroll separately from its action
  footer. Security settings remain visible; subscription overrides expand in place.
- Administration tables become labelled rows on phones, keeping all fields and
  actions. Large technical histories may retain their own horizontal scroll area.

## Visual system

`client/src/theme/modernTheme.ts` owns colors, typography and component geometry.
Use semantic theme colors for errors, warnings, success and chart limits. Orange
identifies actions and selection, not generic machine health. Cards use 7px corners,
controls 5px and tags 4px. Data tables use tabular numerals. Phone actions have a
minimum 44px target; focus and reduced-motion behavior remain visible.
The established inset highlight and shallow button relief are retained as part
of the industrial theme, overriding the Taste preset's flat-button preference.
Sparse or empty data views keep their real content height; do not fill them with
decorative metrics or fabricated records.

## Evidence and state

Name the observed service: browser link, database, collector or machine. A live
browser connection does not establish machine health. Unknown uses a neutral
color and is distinct from disconnected, faulty, stale or loading. A database
test shows its result and time; it does not invent configuration or ongoing health.

The overview reuses the scoped live-production API and existing shift reports.
Running, idle, fault, planned and unknown intervals remain separate. Unknown time
is never counted as downtime. Measurements retain their observation time and
partial-history label; zero remains zero. Report timestamps identify historical
evidence when a refresh fails. Role restrictions and compliance mode still apply.

## Verification

`scripts/test-responsive-ui.mjs` exercises both themes, desktop/phone/tablet
layouts, German core screens, all Settings and Operations destinations, real
machine creation and database testing, role boundaries and saved widget layout
preservation using an isolated database. Its images contain synthetic test data.
The existing browser suite, accessibility checks, unit tests and protected CI
remain required. Automated browser evidence does not replace native phone,
screen-reader, physical-machine or 72-hour acceptance.
