# Siemens SIMATIC S7-1500 pilot

Target: a read-only connection to the CPU's **OPC UA server**. The dashboard does
not download PLC programs, enable PUT/GET or write process tags. It calls no methods,
with one approved exception: when PLC alarm observation is switched on for a machine,
it calls ConditionRefresh to receive current alarm conditions; it never acknowledges,
confirms or comments alarms ([daily operations](DAILY_OPERATIONS.md#plc-alarms)).
The nominated family is S7-1500; no physical CPU has been qualified yet.

## Confirm the actual installation

Record CPU order number, CPU variant, firmware, TIA Portal version, OPC UA runtime
licence, enabled endpoint, certificate fingerprints and the approved tag list.
Siemens documents OPC UA server availability from firmware V2.0 across listed
S7-1500 variants; this is not proof that a particular installation has the licence,
configuration, capacity or network access needed for this pilot.
See [Siemens server capabilities](https://docs.tia.siemens.cloud/r/en-us/v20/configuring-automation-systems/using-opc-ua-communication-s7-1200-s7-1500-s7-1500t/using-the-s7-1500-as-an-opc-ua-server-s7-1500-s7-1500t/interesting-information-about-the-opc-ua-server-of-the-s7-1500-cpus-s7-1500-s7-1500t/the-opc-ua-server-of-the-s7-1500-cpus-s7-1500-s7-1500t).

Use the CPU-specific runtime licence shown in TIA Portal. Do not infer a licence
tier from the family name. Siemens' [configuration example](https://cache.industry.siemens.com/dl/files/901/109737901/att_1116717/v2/109737901_OPC_UA_Client_S7-1500_DOKU_V1_5_en.pdf)
describes enabling the server and configuring a username/password identity;
menu names and user administration differ between releases.

## Commission the connection

1. On an approved network, have the PLC owner enable the OPC UA server and expose
   only the required tags with read permissions. Use a dedicated reader account
   and disable guest access for the pilot. Record units, scaling, state meanings,
   counter rollover/reset rules and normal update intervals.
2. Select **Sign and Encrypt** and **Basic256Sha256** in the dashboard and the CPU.
   Use another displayed policy only when that exact endpoint supports it.
3. Export the dashboard application certificate from Settings → Certificates and
   have the PLC owner trust it in TIA Portal. Keep its private key on the dashboard.
4. Add the machine using a hostname or IP included in the CPU certificate's SAN.
   Choose username/password authentication. The dashboard encrypts the password
   before storage; editing a machine leaves the password blank and retains it
   only for the same username. Switching explicitly to Anonymous clears it.
5. Attempt the connection. Compare the rejected server certificate's SHA-256
   fingerprint against an independent export from TIA Portal before accepting it
   in Settings. Unknown certificates are never automatically accepted.
6. Browse and run the Production commissioning check. Inspect actual values,
   source timestamps, data types and quality. Save a reviewed profile using
   namespace URIs, then confirm durable history and freshness with the PLC owner.
7. Qualify disconnect/reconnect, server restart, counter reset, stale data and a
   controlled certificate replacement. Agree on load and sampling intervals;
   a passing simulator test does not establish CPU capacity.

User X.509 authentication is distinct from the application certificate. The
dashboard supports it when the server advertises certificate user tokens; do not
assume every S7-1500 firmware/configuration does. The first S7-1500 recipe uses
username/password over an encrypted channel. Siemens' [communication manual](https://support.industry.siemens.com/cs/attachments/59192925/s71500_communication_function_manual_en-US_en-US.pdf)
documents endpoint security policies and firmware-specific user settings.

## Renewal and recovery

The certificate list shows expiry and fingerprints. Renew before expiry, verify
the replacement's identity, and explicitly exchange trust on both sides. A new
server certificate is rejected until trusted. Regenerating the dashboard client
certificate requires the PLC owner to update client trust. Never work around a
certificate failure by selecting None.

Back up the database together with `MACHINE_SECRETS_KEY_FILE` (default
`data/machine-secrets.key`) and the complete OPC UA PKI directory. The encrypted
database alone cannot recover credentials. Protect backups and the key with
Windows ACLs or Linux file permissions; Unix mode bits alone do not establish
Windows access control. Losing the key requires restoring it or re-entering
identities. Restore to an isolated instance before reconnecting any real machine.

| Failure                           | Operator action                                                      |
| --------------------------------- | -------------------------------------------------------------------- |
| Certificate untrusted             | Compare fingerprint with the PLC owner; then explicitly trust        |
| Certificate expired/not yet valid | Check both clocks and renew through the owner                        |
| Hostname/IP mismatch              | Use a SAN-listed endpoint or renew the PLC certificate               |
| User access denied                | Check account, password, user rights and advertised identity support |
| Unknown namespace/tag             | Recheck exported server interface and profile namespace URI          |
| Bad quality or stale data         | Treat measurement as unknown; investigate source/network             |
| Credential decryption failed      | Restore the matching key or replace credentials                      |

## Qualification record

| Layer                          | Evidence/status                                                     |
| ------------------------------ | ------------------------------------------------------------------- |
| Dashboard secure software path | `scripts/test-secure-machine.mjs`, invoked by production acceptance |
| S7-1500 CPU/firmware/licence   | Not yet supplied; physical qualification open                       |
| Actual tag semantics and load  | Requires owner-approved measurements                                |
| PLC configuration changes      | Performed by the PLC owner, outside automated tests                 |
