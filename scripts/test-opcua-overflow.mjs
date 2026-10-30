import assert from "node:assert/strict";
import { MonitoredItem } from "node-opcua-server";
import {
  AddressSpace,
  generateAddressSpace,
  nodesets,
  DataValue,
  DataType,
  StatusCode,
  StatusCodes,
  TimestampsToReturn,
  MonitoredItemNotification,
} from "node-opcua";
const addressSpace = AddressSpace.create();
await generateAddressSpace(addressSpace, nodesets.standard);
const namespace = addressSpace.registerNamespace(
  "urn:owned-overflow-regression",
);
const node = namespace.addVariable({
  organizedBy: addressSpace.rootFolder.objects,
  browseName: "Value",
  dataType: "Double",
  minimumSamplingInterval: 1000,
});
try {
  for (const discardOldest of [true, false]) {
    for (const statusCode of [
      StatusCodes.Good,
      StatusCodes.Uncertain,
      StatusCodes.BadNoCommunication,
      StatusCode.makeStatusCode(StatusCodes.Uncertain, "SemanticChanged"),
    ]) {
      const item = new MonitoredItem({
        monitoredItemId: 1,
        clientHandle: 1,
        samplingInterval: 1000,
        queueSize: 2,
        discardOldest,
        filter: null,
        timestampsToReturn: TimestampsToReturn.Both,
      });
      item.setNode(node);
      try {
        const at = new Date("2026-10-30T00:00:00Z");
        for (let value = 0; value < 5; value++)
          item.recordValue(
            new DataValue({
              value: { dataType: DataType.Double, value },
              statusCode,
              sourceTimestamp: at,
              serverTimestamp: at,
            }),
          );
        assert.equal(item.queue.length, 2);
        const overflow = item.queue[discardOldest ? 0 : 1];
        assert(overflow instanceof MonitoredItemNotification);
        assert(overflow.value.statusCode.hasOverflowBit);
        const expected = StatusCode.makeStatusCode(
          statusCode,
          "Overflow | InfoTypeDataValue",
        );
        assert.equal(overflow.value.statusCode.value, expected.value);
        assert.equal(overflow.value.sourceTimestamp.getTime(), at.getTime());
        assert.equal(overflow.value.serverTimestamp.getTime(), at.getTime());
        assert.equal(overflow.value.value.value, discardOldest ? 3 : 4);
        assert.equal(statusCode.hasOverflowBit, false);
      } finally {
        item.dispose();
      }
    }
  }
} finally {
  addressSpace.dispose();
}
console.log(
  "PASS: OPC UA queue overflow retains Good/Uncertain/Bad quality, metadata, timestamps and source values for both discard policies",
);
