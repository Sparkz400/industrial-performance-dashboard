# Machine compatibility

The implemented collector uses **OPC UA over opc.tcp**. The local example uses the
bundled node-opcua simulator. No physical machine or PLC model is certified by
the automated test suite.

An existing machine must expose an accessible OPC UA server, or reach the collector
through a gateway that exposes its data over OPC UA. The optional built-in read-only
Modbus TCP gateway (function codes 03/04) is one such bridge; see
[legacy gateway](LEGACY_GATEWAY.md). Direct S7, EtherNet/IP and MQTT collectors are
not included. A third-party gateway's compatibility and licensing remain the
deployer's responsibility.

Map scalar numeric, Boolean or string tags. Verify units, state enumerations,
timestamps, quality flags, counter behavior and the requested sampling interval.
Array and structured values are outside the supported collector contract.
Sessions can be anonymous, username/password or user-certificate; protected
identities need an encrypted channel and explicitly trusted server certificates
([S7-1500 pilot](S7_1500_PILOT.md)). Those paths are tested against owned servers only.

For OEE, map the operating state, configure each state meaning, and select cumulative
production/good/reject counters and an ideal cycle time. Do not infer machine meaning
from a tag name. Negative or missing counter values are unknown. Shift profiles
declare reset-to-zero, reject-decrease or rollover with an explicit modulus; the
older dashboard OEE widget still treats a decrease as a reset to zero.

| Evidence | Status |
| --- | --- |
| Owned node-opcua simulator, anonymous and protected identities | Automated (CI and local scripts) |
| Owned Modbus TCP fixture through the built-in gateway | Automated (`test-gateway.mjs`) |
| Physical PLC, vendor server or third-party gateway | None recorded yet |

Before a pilot, compare a complete shift with independently collected counts and
downtime. Exercise machine restarts, counter resets, lost connections, bad-quality
readings, database interruptions and local process restarts. Record exact device,
firmware, server, mapping and software revision details.
