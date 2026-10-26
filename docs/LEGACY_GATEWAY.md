# Read-only legacy gateway

The optional reference adapter polls one explicitly configured Modbus TCP register
block and exposes scalar values through encrypted OPC UA on **127.0.0.1 only**.
It supports register reads 03/04, never writes, coils or RTU. It is a bounded
starting point for a legacy-machine pilot, not a vendor-qualified universal driver.
The nominated S7-1500 pilot still uses its native OPC UA server; this example does
not assume that a Siemens CPU exposes the fixture's register map.

## Owned demonstration

From the repository root, after the normal local setup and server build:

```sh
node server/dist/simulation/modbusSimulationServer.js
```

The simulator binds localhost:1502 and provides two synthetic units. Copy
`examples/legacy-gateway.json` to `server/data/gateway/config.json`, set
`ENABLE_LEGACY_GATEWAY=true` in the private server environment, and restart the
server. The integrated adapter keeps its identity in `data/gateway/pki` and trusts
the app's public client certificate. It ignores the example's standalone PKI paths.
It does not start in recovery mode. Invalid enabled configuration prevents startup.

In Machine settings create a machine with host **localhost**, port **4842**,
resource **/UA/LegacyGateway**, **SignAndEncrypt**, **Basic256Sha256**, anonymous
user identity. Application-certificate trust is still required. Review the gateway
certificate fingerprint against `server/data/gateway/pki/gateway.pem`, then trust
that certificate using the dashboard certificate controls. No unknown remote
certificate is accepted automatically.

In **Production shift → Commission machine**, import
`examples/legacy-production-profile.json`, preview all four signals, review units,
state interpretation and counter-reset policy, then save. The namespace URI and
identifiers survive namespace-index changes. A second standalone gateway can use
another OPC UA port, PKI directory and Modbus unit while reusing the profile.

Standalone invocation is also available:

```sh
node server/dist/src/gateway/runGateway.js examples/legacy-gateway.json
```

Set the example's `trustedClientCertificate` to the app's public certificate;
standalone paths resolve relative to the configuration file. Keep that process
co-located with the collector, and back up its configuration and PKI separately.

## Container installation

Use the integrated adapter so localhost refers to the same container as the
collector. Put the reviewed JSON at `/app/server/data/gateway/config.json` in the
existing data volume, owned by UID 1000. Set `ENABLE_LEGACY_GATEWAY=true` in the
generated app environment (or the root Compose environment), then recreate the
app. Do not publish port 4842. The configured Modbus host must be reachable from
the container; localhost only reaches a simulator in that same container.

The [operations procedure](OPERATIONS.md) backs up the complete data volume,
including this configuration and gateway identity. Restores stay in recovery mode
without polling, even when the enable flag was saved. Review the destination and
firewall before explicit activation. Never replace a lost key with an unrelated
identity: restore the matched certificate/key backup and review trust on renewal.

## Mapping and measurement contract

- Addresses are **zero-based offsets**, not printed 40001-style reference numbers.
  Confirm the device manual, unit identifier, readable block and permitted poll rate.
- One block contains at most 125 registers and 64 mapped scalar tags. Each register
  is big-endian. For 32-bit integers/floats choose `high-first` or `low-first` word
  order from the device documentation. Signedness and word order are not guessed.
- Each poll uses a new TCP connection, with a bounded timeout and no overlapping
  poll. This modest reference implementation is unsuitable for high-rate workloads
  until measured on the intended device and network.
- `Good` means the read and numeric decoding succeeded. It does not prove sensor
  calibration or device application health. Source time is **gateway observation
  time**, because these Modbus registers supply no PLC timestamp. Receive time is
  recorded separately by the dashboard.
- Timeout/malformed replies expose `BadNoCommunication`; non-finite floats expose
  `BadOutOfRange`. The last raw value/time may remain available, but numeric charts
  store unknown for bad quality. No production is invented across the gap.
- The adapter has no historical buffer. The dashboard's durable queue protects
  measurements it received; disconnected or unobserved intervals remain unknown.
- Modbus TCP here is plain traffic on an approved isolated machine network. This
  adapter does not implement Modbus Security/TLS or device authentication. Use an
  approved industrial gateway where the deployment requires those capabilities.

## Evidence and remaining qualification

`modbusRead.test.ts` exercises fragmented frames, transaction/protocol/unit/function
checks, byte counts, exceptions, timeout, signedness and word order. The production
browser suite commissions two owned units using 03/04, exports/reuses the profile,
rejects OPC UA writes, persists bad-quality gaps and recovers after communication
loss. Managed restart preserves the identity; recovery skips startup. The runtime
smoke also exercises the encrypted adapter in the final container image.

Real-device register maps, firmware, network capacity, permitted read load and
physical pilot acceptance remain open. The examples are synthetic, not Siemens
protocol emulation or evidence of any vendor's compatibility.

Protocol references: [Modbus application protocol](https://www.modbus.org/file/secure/modbusprotocolspecification.pdf)
and [Modbus TCP implementation guide](https://www.modbus.org/file/secure/messagingimplementationguide.pdf).
