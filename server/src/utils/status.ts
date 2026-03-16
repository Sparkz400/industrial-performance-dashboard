import StatusConstants from "./statusConstants.js";
import { EventEmitter } from "events";
import type {
  StatusDetails,
  ServiceStatusInfo,
  FullStatusResponse,
} from "@performance-dashboard/shared";

export type { StatusDetails, ServiceStatusInfo };
export type FullStatus = FullStatusResponse;

interface StatusMap {
  [key: string]: string;
  lastUpdated: string;
}

interface DetailsMap {
  [key: string]: StatusDetails;
}

/**
 * Status manager with event emitter for real-time updates
 */
class StatusManager extends EventEmitter {
  private _status: StatusMap;
  private _details: DetailsMap;

  constructor() {
    super();
    this._status = {
      [StatusConstants.DATABASE]: StatusConstants.UNKNOWN,
      [StatusConstants.OPCUA]: StatusConstants.UNKNOWN,
      lastUpdated: new Date().toISOString(),
    };
    this._details = {
      [StatusConstants.DATABASE]: { message: "Not initialized" },
      [StatusConstants.OPCUA]: { message: "Not initialized" },
    };
  }

  setServiceStatus(
    service: string,
    newStatus: string,
    details: StatusDetails = {},
  ): void {
    const oldStatus = this._status[service];
    const oldDetailsString = JSON.stringify(this._details[service]);
    const newDetailsString = JSON.stringify(details);

    if (oldStatus !== newStatus || oldDetailsString !== newDetailsString) {
      const timestamp = new Date().toISOString();

      this._status = {
        ...this._status,
        [service]: newStatus,
        lastUpdated: timestamp,
      };

      this._details = {
        ...this._details,
        [service]: details,
      };

      const fullStatus = this.getFullStatus();

      this.emit("statusChanged", {
        service,
        oldStatus,
        newStatus,
        timestamp,
        details,
      });
      this.emit("broadcastUpdate", fullStatus);
    }
  }

  getOverallStatus(): string {
    const statusPriority: string[] = [
      StatusConstants.UNKNOWN,
      StatusConstants.CONNECTED,
      StatusConstants.CONNECTING,
      StatusConstants.WARNING,
      StatusConstants.DISCONNECTED,
      StatusConstants.ERROR,
    ];

    let worstStatus: string = StatusConstants.UNKNOWN;
    for (const service in this._status) {
      if (service !== "lastUpdated") {
        const serviceStatus = this._status[service];
        const currentPriority = statusPriority.indexOf(worstStatus);
        const servicePriority = statusPriority.indexOf(serviceStatus);

        if (servicePriority > currentPriority) {
          worstStatus = serviceStatus;
        }
      }
    }

    return worstStatus;
  }

  getServiceStatus(service: string): string {
    return this._status[service] || StatusConstants.UNKNOWN;
  }

  getServiceDetails(service: string): StatusDetails {
    return this._details[service] || {};
  }

  getFullStatus(): FullStatus {
    const overall = this.getOverallStatus();
    const dbStatus = this.getServiceStatus(StatusConstants.DATABASE);
    const opcuaStatus = this.getServiceStatus(StatusConstants.OPCUA);
    return {
      database: {
        status: dbStatus,
        statusText: StatusConstants.getStatusLabel(dbStatus),
        statusColor: StatusConstants.getStatusColor(dbStatus),
        details: this.getServiceDetails(StatusConstants.DATABASE) || {},
      },
      opcua: {
        status: opcuaStatus,
        statusText: StatusConstants.getStatusLabel(opcuaStatus),
        statusColor: StatusConstants.getStatusColor(opcuaStatus),
        details: this.getServiceDetails(StatusConstants.OPCUA) || {},
      },
      overall: {
        status: overall,
        statusText: StatusConstants.getStatusLabel(overall),
        statusColor: StatusConstants.getStatusColor(overall),
      },
      lastUpdated: this._status.lastUpdated,
    };
  }

  setDatabaseStatus(newStatus: string, details: StatusDetails = {}): void {
    this.setServiceStatus(StatusConstants.DATABASE, newStatus, details);
  }

  setOpcuaStatus(newStatus: string, details: StatusDetails = {}): void {
    this.setServiceStatus(StatusConstants.OPCUA, newStatus, details);
  }
}

const statusManager = new StatusManager();

export default statusManager;
