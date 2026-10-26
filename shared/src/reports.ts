export interface ScheduledReportSection {
  type: string;
  title?: string;
  machineId?: number;
  nodeKeys?: string[];
  [key: string]: unknown;
}

export interface ScheduledReportConfig {
  title?: string;
  lookbackHours?: number;
  sections?: ScheduledReportSection[];
  [key: string]: unknown;
}
