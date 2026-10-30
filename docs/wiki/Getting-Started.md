# Getting started

The [desktop and phone interface](https://github.com/Sparkz400/performance_dashboard/blob/main/DESIGN.md)
opens on the shift overview. Custom dashboards stay available separately. On a phone,
use **More** for all permitted administration, quality, reporting and asset destinations.
Operations is grouped by work area; Settings has a labelled section selector.

Use Node.js 24, npm and Docker with Compose. The local example includes a synthetic
OPC UA simulator and a separate PostgreSQL database. No physical machine is needed.

Follow the maintained [setup guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/GETTING_STARTED.md)
for installation, private environment settings, database migrations, simulator
mapping, local Windows startup and container deployment.

Read [compatibility](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/COMPATIBILITY.md)
before connecting equipment and [security](https://github.com/Sparkz400/performance_dashboard/blob/main/SECURITY.md)
before exposing a service beyond a workstation.

Container images use Node 24/Wolfi with browser-free PDF generation. Rebuild with fresh base packages
and review the [exact-image security evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md)
before deployment. The [reporting migration guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md)
covers preserved features, existing volumes, upgrades, rollback and email settings.

After starting the owned simulator, open **Production shift → Commission machine**.
Follow the [production workflow guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md)
for reusable mappings, shift reports and isolated recovery/browser checks.

For the nominated Siemens SIMATIC S7-1500 pilot, follow the
[secure connection and renewal guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/S7_1500_PILOT.md).
Confirm the exact CPU, firmware and runtime licence before physical qualification.

Use the [operations guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/OPERATIONS.md)
for isolated installation previews, complete backups, fresh-instance restores and
upgrade/rollback procedures. Configuration-only exports are not recovery backups.

The [factory-pilot acceptance record](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/FACTORY_PILOT_ACCEPTANCE.md)
maps secure onboarding, recovery, operator workflows, unattended operation, legacy
gateway and incident replay to their tests and remaining qualification limits.
