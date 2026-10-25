# Machine compatibility

The implemented collector uses **OPC UA over opc.tcp**. The local example uses the
bundled node-opcua simulator. No physical machine or PLC model is certified by
the automated test suite.

An existing machine must expose an accessible OPC UA server, or use an external
gateway that exposes its data through OPC UA. Direct Modbus, S7, EtherNet/IP and
MQTT collectors are not included. A gateway's compatibility and licensing remain
the deployer's responsibility.

Map scalar numeric, Boolean or string tags. Verify units, state enumerations,
timestamps, quality flags, counter behavior and the requested sampling interval.
Array and structured values are outside the supported collector contract.
The current session connection uses anonymous user identity; servers requiring
username/password or user-certificate identity need further implementation.

For OEE, map the operating state as `OperationMode`, configure each state meaning,
and select cumulative production/good/reject counters and an ideal cycle time.
Do not infer machine meaning from a tag name. Negative or missing counter values
are unknown; a decrease is treated as a reset to zero, not a proven rollover.

Before a pilot, compare a complete shift with independently collected counts and
downtime. Exercise machine restarts, counter resets, lost connections, bad-quality
readings, database interruptions and local process restarts. Record exact device,
firmware, server, mapping and software revision details.
