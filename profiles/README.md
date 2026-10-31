# Machine-profile catalog

These are reviewed starting mappings, not plug-and-play equipment certifications.
The catalog describes the transport, equipment/firmware scope, qualification,
evidence and limitations separately from each importable profile.

| Profile | Qualification | Scope |
| --- | --- | --- |
| [Owned factory replay](owned-factory.json) | Simulator | Four synthetic production signals; independent shift ledger, gaps, bad quality and rejected resets |
| [Owned legacy gateway](owned-legacy.json) | Simulator | Owned Modbus fixture offsets 0–6, exposed through the legacy gateway; not a vendor map |

Download a profile JSON file, then use **Production → Commissioning → Import profile**.
Review its node identities, scale, units, state meanings, maximum gap, counter policy
and cycle standard. Import only previews the fields; commissioning and its read-only
checks still determine whether it can be saved for the selected machine.
For the legacy profile also follow the [gateway recipe](../docs/LEGACY_GATEWAY.md).

## Contribute

1. Add a plain version-1 production profile in this directory and an entry in
   [catalog.json](catalog.json). Use stable lowercase IDs and filenames.
2. Name the exact model, firmware/version and tested scope. Include limitations
   and a repository-relative, sanitized evidence/test file that a reviewer can inspect.
3. Remove credentials, endpoints containing user information, actual plant names,
   certificate material, personal information and site-identifying measurements.
   The validator rejects extra schema keys and common credential patterns; a
   maintainer must still review free-text content and permissions to share it.
4. Add a reproducible fixture/test with expected state/counter/OEE results. Include
   reset/rollover semantics, units and missing/bad-quality behavior where applicable.
5. Run `npm run build:server`, then `npm run profiles:check`, and the relevant owned
   simulator test. Open a pull request with the evidence and exact support limits.

Validation reuses the application's production-profile schema and semantic checks.
It rejects duplicate IDs, unknown metadata, malformed mappings, missing evidence
files and paths escaping the repository (including symlinks). No connector code is
downloaded or executed from catalog entries.

Qualification levels:

- **simulator:** exercised only against owned simulation/replay fixtures. This is
  the level of every currently published entry.
- **reported:** a contributor reports compatibility; maintainers have not physically
  verified it. Include the sanitized report and exact scope.
- **physically-verified:** a named reviewer has accepted evidence from the stated
  equipment/firmware, including test date, permitted scope and failures/limitations.
  `reviewer` and `testedOn` are required. Automated schema checks cannot establish
  physical acceptance; maintainers must review that evidence before merging the claim.

Qualification is scoped to that entry/version. It does not establish compatibility
with a whole vendor family, later firmware, a production installation or its operators.
