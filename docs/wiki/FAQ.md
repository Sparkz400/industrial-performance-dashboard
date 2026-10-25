# Frequently asked questions

**Does it work with every industrial machine?**

No. The implemented collector uses OPC UA scalar values and anonymous sessions.
See [compatibility](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/COMPATIBILITY.md)
for the actual scope and gateway requirements.

**Is it production-ready or compliance-certified?**

No such qualification is claimed. Automated tests and simulator checks cover a
bounded software scope. See [status](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/STATUS.md).

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
