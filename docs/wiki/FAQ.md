# Frequently asked questions

**Does it work with every industrial machine?**

No. The implemented collector uses OPC UA scalar values and anonymous sessions.
See [compatibility](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/COMPATIBILITY.md)
for the actual scope and gateway requirements.

**Is it production-ready or compliance-certified?**

No such qualification is claimed. Automated tests and simulator checks cover a
bounded software scope. See [status](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/STATUS.md).

**Which features are complete, and what is planned next?**

The [capability assessment](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/RESEARCH.md)
separates implemented behavior from incomplete integrations and experimental screens.
The current inspection also identifies correctness gaps requiring follow-up.
See [[Roadmap]] for the staged plan and links to acceptance criteria. A planned
feature does not expand present compatibility or production-readiness claims.

The [first P0 acceptance record](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/P0_ACCEPTANCE.md)
documents identity, SPC isolation and trend fixes. Edge transfer is disabled until
central ingestion exists. The AI assistant and external-provider integration have been removed.

**Why is OEE unavailable?**

Map operating states, production counters and quality counters, then choose a
window with complete measurements. Missing coverage must not become a confident
percentage. The simple simulator does not include production counters.

**Where do I ask for help or report security issues?**

Use [Discussions](https://github.com/Sparkz400/performance_dashboard/discussions)
for setup help and the [security policy](https://github.com/Sparkz400/performance_dashboard/blob/main/SECURITY.md)
for private vulnerability reporting.
## Does passing CI mean production-ready?

No. Functional tests, dependency audits and container security reports are separate
evidence. Review [current status and limits](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/STATUS.md), including image advisories and physical-machine qualification.

The migrated runtime's full scan is clear; this does not qualify production hardware
or future builds. The full npm audit, CodeQL and image reports are separate checks; see the
[security review](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md)
for current evidence and the release gate.

## Can I use public links or notification channels?

Administrators can share selected trend widgets through read-only links that expire
within 30 days, can be revoked at any time and may be embedded only on listed sites.
Links reveal only the chosen signals for a bounded recent window; see the
[sharing contract](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/SECURITY_BOUNDARIES.md#selected-data-links-f08).
Signed-in accounts see only the machines granted to them; operators classify observed stops.
Signed alarm webhooks are tested; email/chat/SMS channel delivery is disabled.
Scheduled report PDF email is a separate SMTP service; see the
[reporting guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md).
See the [workflow limits](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md).
