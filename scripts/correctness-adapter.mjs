import { calculateShift } from "../server/dist/src/services/shiftCalculation.js";
import { validateProfile } from "../server/dist/src/services/productionProfile.js";
import {
  MeasurementSpool,
  toMeasurementRow,
} from "../server/dist/src/queue/measurementSpool.js";

// Only inputs cross this boundary; the adapter never receives expected answers.
export function dashboardResult(input) {
  const profile = validateProfile(input.profile);
  const spool = new MeasurementSpool(":memory:");
  try {
    for (const delivery of input.deliveries) {
      const signal = profile.signals[delivery.signal];
      if (!signal) throw new Error(`Unmapped delivery: ${delivery.signal}`);
      spool.enqueue({
        eventId: delivery.id,
        key: signal.nodeKey,
        label: delivery.signal,
        timestamp: delivery.at,
        sourceTimestamp: delivery.at,
        receivedAt: delivery.at,
        value: delivery.value,
        statusCode: delivery.quality,
        dataType: signal.dataType,
        signalMetadata: {
          namespaceUri: signal.namespaceUri,
          identifier: signal.identifier,
        },
        machineId: 1,
      });
    }
    const rows = spool.peek(input.deliveries.length).map(toMeasurementRow);
    const samples = Object.fromEntries(
      Object.values(profile.signals).map((signal) => [
        signal.nodeKey,
        rows
          .filter((row) => row.nodeKey === signal.nodeKey)
          .sort((a, b) => a.timestamp - b.timestamp),
      ]),
    );
    const report = calculateShift({
      ...input,
      id: 1,
      machineId: 1,
      name: "Synthetic correctness benchmark",
      job: { reference: "BENCHMARK", product: "Synthetic", target: null },
      profile,
      start: new Date(input.start),
      end: new Date(input.end),
      asOf: new Date(input.asOf),
      samples,
    });
    const fields = [
      "seconds",
      "plannedSeconds",
      "scheduledSeconds",
      "observedSeconds",
      "quantities",
      "quantitySource",
      "stateSource",
      "manualStateSeconds",
      "oee",
      "verified",
    ];
    return {
      deliveredEvents: input.deliveries.length,
      uniqueEvents: rows.length,
      ...Object.fromEntries(fields.map((field) => [field, report[field]])),
    };
  } finally {
    spool.close();
  }
}
