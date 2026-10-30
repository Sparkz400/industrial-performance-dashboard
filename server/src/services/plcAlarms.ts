import * as opcua from "node-opcua";
import { eq } from "drizzle-orm";
import db from "../database/db.js";
import {
  machines,
  plcAlarmEvents,
  plcAlarmSubscriptions,
} from "../database/schema.js";
import { certificateManager } from "../opc-ua/opcuaClient.js";
import { createMachineSession } from "./machineIdentity.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import { PlcAlarmSpool } from "../queue/plcAlarmSpool.js";

/** Selected event fields, in the order the server returns them. */
export const EVENT_FIELDS = [
  "EventId",
  "EventType",
  "SourceNode",
  "SourceName",
  "Time",
  "ReceiveTime",
  "Message",
  "Severity",
  "ConditionName",
  "ActiveState.Id",
  "AckedState.Id",
  "Retain",
  "ConditionId",
] as const;
const REFRESH_START = opcua.ObjectTypeIds.RefreshStartEventType;
const REFRESH_END = opcua.ObjectTypeIds.RefreshEndEventType;
const REFRESH_REQUIRED = opcua.ObjectTypeIds.RefreshRequiredEventType;

/** OPC UA severity (1–1000) in the application's alarm scale. */
export function plcSeverity(severity: number) {
  return severity <= 200
    ? "info"
    : severity <= 400
      ? "low"
      : severity <= 600
        ? "medium"
        : severity <= 800
          ? "high"
          : "critical";
}

type Fields = Record<(typeof EVENT_FIELDS)[number], opcua.Variant>;
/** One event notification as a stored row; null for refresh markers that are not stored. */
export function eventRow(
  machineId: number,
  values: opcua.Variant[],
  refresh: boolean,
) {
  const f = Object.fromEntries(
    EVENT_FIELDS.map((k, i) => [k, values[i]]),
  ) as Fields;
  const type = f.EventType?.value as opcua.NodeId | null;
  const id = f.EventId?.value as Buffer | null;
  if (!type || !id?.length) return null;
  const text = (v: opcua.Variant) =>
    v?.value == null ? null : String(v.value);
  const date = (v: opcua.Variant) =>
    v?.value instanceof Date ? v.value : null;
  const bool = (v: opcua.Variant) =>
    typeof v?.value === "boolean" ? v.value : null;
  return {
    machineId,
    eventId: Buffer.from(id).toString("hex").slice(0, 200),
    eventType: type.toString(),
    conditionId: text(f.ConditionId),
    conditionName: text(f.ConditionName),
    sourceName: text(f.SourceName),
    sourceNode: text(f.SourceNode),
    eventTime: date(f.Time) ?? new Date(),
    receiveTime: date(f.ReceiveTime),
    severity: Number(f.Severity?.value ?? 0),
    message: (f.Message?.value as opcua.LocalizedText | null)?.text ?? null,
    active: bool(f["ActiveState.Id"]),
    acked: bool(f["AckedState.Id"]),
    retain: bool(f.Retain),
    refresh,
  };
}

export interface PlcAlarmStatus {
  state: "connecting" | "connected" | "disconnected" | "error";
  /** Events received, including re-sent ones already stored. */
  received: number;
  refreshCalls: number;
  lastEventAt: string | null;
  lastError: string | null;
}
interface Observation {
  client: opcua.OPCUAClient;
  session?: opcua.ClientSession;
  subscription?: opcua.ClientSubscription;
  refreshing: boolean;
  status: PlcAlarmStatus;
}

/**
 * Read-only observation of OPC UA alarms and conditions on a session of its own. The only
 * method ever called is ConditionRefresh (approved exception), on connect, after
 * reconnection and when the server asks for it; nothing is acknowledged, confirmed or
 * commented. Events are stored once per source EventId.
 */
class PlcAlarmService {
  private observations = new Map<number, Observation>();
  private spool?: PlcAlarmSpool;
  private retry?: ReturnType<typeof setInterval>;
  private flushing?: Promise<void>;
  running = false;

  async startAll() {
    if (this.running) return;
    this.spool = new PlcAlarmSpool(
      config.OPCUA_SPOOL_PATH + ".plc-alarms.sqlite",
      {
        maxEntries: config.OPCUA_SPOOL_MAX_ENTRIES,
        minFreeBytes: config.OPCUA_SPOOL_RESERVE_MB * 1024 * 1024,
      },
    );
    this.running = true;
    this.retry = setInterval(() => void this.flush(), 1000);
    this.retry.unref();
    const rows = await db
      .select({ machineId: plcAlarmSubscriptions.machineId })
      .from(plcAlarmSubscriptions)
      .where(eq(plcAlarmSubscriptions.enabled, true));
    for (const row of rows) await this.reload(row.machineId);
  }

  async reload(machineId: number) {
    if (!this.running) return;
    await this.stop(machineId);
    const [subscribed] = await db
      .select()
      .from(plcAlarmSubscriptions)
      .where(eq(plcAlarmSubscriptions.machineId, machineId));
    if (subscribed?.enabled) await this.start(machineId);
  }

  private async start(machineId: number) {
    const [machine] = await db
      .select()
      .from(machines)
      .where(eq(machines.id, machineId));
    if (!machine) return;
    const status: PlcAlarmStatus = {
      state: "connecting",
      received: 0,
      refreshCalls: 0,
      lastEventAt: null,
      lastError: null,
    };
    const client = opcua.OPCUAClient.create({
      ...(await certificateManager.getClientOptions(
        machine.securityMode ?? "None",
        machine.securityPolicy ?? "None",
      )),
      endpointMustExist: false,
      connectionStrategy: {
        initialDelay: 1000,
        maxDelay: 10000,
        maxRetry: 1_000_000,
      },
    });
    const observation: Observation = { client, refreshing: false, status };
    this.observations.set(machineId, observation);
    client.on("connection_lost", () => (status.state = "disconnected"));
    // A reconnect may have lost events; the current conditions are asked for again.
    client.on("after_reconnection", () => {
      status.state = "connected";
      void this.refresh(observation);
    });
    try {
      await client.connect(machine.endpointUrl);
      observation.session = await createMachineSession(
        client,
        machineId,
        machine.endpointUrl,
        machine.securityMode ?? "None",
      );
      observation.subscription = await observation.session.createSubscription2({
        requestedPublishingInterval: 500,
        requestedLifetimeCount: 600,
        requestedMaxKeepAliveCount: 20,
        maxNotificationsPerPublish: 200,
        publishingEnabled: true,
      });
      const item = await observation.subscription.monitor(
        {
          nodeId: opcua.resolveNodeId("Server"),
          attributeId: opcua.AttributeIds.EventNotifier,
        },
        {
          queueSize: 1000,
          discardOldest: false,
          filter: opcua.constructEventFilter([...EVENT_FIELDS]),
        },
        opcua.TimestampsToReturn.Neither,
      );
      item.on(
        "changed",
        (values: opcua.Variant[]) =>
          void this.record(machineId, observation, values),
      );
      status.state = "connected";
      await this.refresh(observation);
    } catch (error) {
      status.state = "error";
      status.lastError = error instanceof Error ? error.message : String(error);
      logger.warn(`[PLC alarms] Machine ${machineId}: ${status.lastError}`);
    }
  }

  private async refresh(observation: Observation) {
    const { session, subscription, status } = observation;
    if (!session || !subscription) return;
    try {
      status.refreshCalls++;
      await opcua.callConditionRefresh(session, subscription.subscriptionId);
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async record(
    machineId: number,
    observation: Observation,
    values: opcua.Variant[],
  ) {
    const type = values[1]?.value as opcua.NodeId | null;
    if (type?.namespace === 0) {
      if (type.value === REFRESH_START)
        return void (observation.refreshing = true);
      if (type.value === REFRESH_END)
        return void (observation.refreshing = false);
      if (type.value === REFRESH_REQUIRED)
        return void this.refresh(observation);
    }
    const row = eventRow(machineId, values, observation.refreshing);
    if (!row) return;
    try {
      this.spool!.enqueue(row);
      observation.status.received++;
      observation.status.lastEventAt = new Date().toISOString();
      void this.flush();
    } catch (error) {
      observation.status.lastError =
        error instanceof Error ? error.message : String(error);
      observation.status.state = "error";
      // Stop this source when local durability fails; already spooled events remain.
      await observation.client.disconnect().catch(() => {});
    }
  }

  private flush() {
    if (!this.spool || this.flushing) return this.flushing;
    this.flushing = this.spool
      .flush(async (rows) => {
        await db.insert(plcAlarmEvents).values(rows).onConflictDoNothing();
      })
      .then(() => {
        for (const [machineId, { status }] of this.observations)
          if (
            !this.spool!.count(machineId) &&
            status.lastError?.startsWith("PLC alarm storage pending:")
          )
            status.lastError = null;
      })
      .catch((error) => {
        for (const { status } of this.observations.values())
          status.lastError = `PLC alarm storage pending: ${String(error)}`;
      })
      .finally(() => {
        this.flushing = undefined;
      });
    return this.flushing;
  }

  async stop(machineId: number) {
    const observation = this.observations.get(machineId);
    this.observations.delete(machineId);
    if (!observation) return;
    try {
      await observation.session?.close();
    } catch {
      /* The session may already be gone. */
    }
    await observation.client.disconnect();
  }

  async stopAll() {
    this.running = false;
    clearInterval(this.retry);
    for (const id of [...this.observations.keys()]) await this.stop(id);
    await this.flushing;
    this.spool?.close();
    this.spool = undefined;
  }

  status(machineId: number) {
    const status = this.observations.get(machineId)?.status;
    return status
      ? { ...status, pending: this.spool?.count(machineId) ?? 0 }
      : null;
  }
}

export const plcAlarms = new PlcAlarmService();
