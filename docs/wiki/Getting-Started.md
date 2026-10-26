# Getting started

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
