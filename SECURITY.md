# Security policy

Report vulnerabilities privately using [Security Advisories](https://github.com/Sparkz400/performance_dashboard/security/advisories/new).
Include the commit, affected boundary, impact and a minimal reproduction using
synthetic machine data. Do not disclose credentials, real endpoints, customer
measurements or exploit details in a public issue.

If private reporting is unavailable, open an issue requesting a private channel
without technical vulnerability details. No dedicated response-time guarantee or
long-term-support policy is currently offered. Report against current `main`.

## Deployment boundaries

- The local demo binds HTTP and PostgreSQL to loopback. Do not expose it directly
  to the Internet or connect it to production machinery for evaluation.
- Use unique secrets, authenticated OPC UA endpoints, deliberate certificate trust,
  network isolation and HTTPS for a deployment beyond your workstation.
- Keep one collector process per measurement spool. Preserve its volume and monitor
  free disk space. A lost or full disk cannot provide durable buffering.
- Treat compliance, custom-widget and edge-sync features as
  experimental. Separate installations are required for independent companies;
  plant membership tables do not establish tenant isolation.
- Review `npm audit`, CodeQL and container scan findings. Known dependency
  advisories are recorded in [status](docs/STATUS.md); a passing functional test
  is not a clean security assessment.

Ignored files are not encrypted, and ignoring a file does not remove earlier
commits. Rotate an exposed secret before arranging history cleanup.
