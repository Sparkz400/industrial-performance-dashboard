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
central ingestion exists; AI suggestions explicitly disclose external processing
and never execute measurement queries.

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

## Can I use public links or notification channels?

Public links and embeds are disabled until scoped data sharing is qualified.
Signed-in viewers can see this company's data and classify observed stops.
Signed alarm webhooks are tested; email/chat/SMS channel delivery is disabled.
See the [workflow limits](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md).
