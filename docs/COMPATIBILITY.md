# Machine compatibility

The implemented collector uses **OPC UA over opc.tcp**. The local example uses the
bundled node-opcua simulator. No physical machine or PLC model is certified by
the automated test suite.

An existing machine must expose an accessible OPC UA server, or reach the collector
through a gateway that exposes its data over OPC UA. The optional built-in read-only
Modbus TCP gateway (function codes 03/04) is one such bridge; see
[legacy gateway](LEGACY_GATEWAY.md). Serial Modbus RTU devices are read through an
RTU-to-TCP gateway addressed by unit identifier, with the same adapter. Machines
that publish JSON over MQTT can be read through an mqtts broker with exact topic
mappings ([MQTT sources](PRODUCTION_WORKFLOW.md#mqtt-sources)). OPC UA Alarms and
Conditions can be observed read-only per machine. A third-party gateway's
compatibility and licensing remain the deployer's responsibility.

Not supported, by decision rather than oversight (see C07 and C06 in
[research decisions](RESEARCH_DECISIONS.md)):

- Native Modbus RTU on a serial port of the app host or container. Use an
  RTU-to-TCP gateway.
- Modbus writes, coils, discrete inputs, Modbus Security/TLS and device
  authentication.
- MTConnect agents. Revisit only when the pilot inventory names CNC machines with
  an agent and no OPC UA.
- Direct S7 (ISO-on-TCP), EtherNet/IP, PROFINET and other vendor protocols. Use the
  machine's OPC UA server or a vendor gateway that exposes OPC UA.
- Sparkplug B payloads, MQTT wildcard subscriptions, plain `mqtt://` and MQTT 5.
- Acknowledging, confirming or commenting PLC alarms. ConditionRefresh is the only
  method the collector calls.

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
| Owned RTU-to-TCP gateway fixture, two units and an absent unit | Automated (`modbusRead.test.ts`) |
| Owned TLS MQTT broker (aedes) with ACLs, redelivery and restart | Automated (`test-mqtt-ingestion.mjs`) |
| Owned OPC UA server with alarms, ConditionRefresh and restart | Automated (`test-plc-alarms.mjs`) |
| Physical PLC, vendor server, serial gateway, MQTT broker or third-party gateway | None recorded yet |

Before a pilot, compare a complete shift with independently collected counts and
downtime. Exercise machine restarts, counter resets, lost connections, bad-quality
readings, database interruptions and local process restarts. Record exact device,
firmware, server, mapping and software revision details.
