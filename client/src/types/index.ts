// ===== Widget Types =====
export interface WidgetComponentProps {
  config: WidgetConfig;
  commonData?: Record<string, unknown>;
  onError?: (error: Error) => void;
}

export interface WidgetSettingsProps {
  config: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

export interface WidgetConfig {
  [key: string]: unknown;
}

export interface Widget {
  id: string;
  type: string;
  config: WidgetConfig;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface WidgetMeta {
  component: React.LazyExoticComponent<React.ComponentType<WidgetComponentProps>>;
  settingsComponent: React.LazyExoticComponent<React.ComponentType<WidgetSettingsProps>> | null;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  title: string;
  description: string;
  category: string;
  icon: string;
  defaultConfig: WidgetConfig;
}

export interface WidgetRegistry {
  [key: string]: WidgetMeta;
}

// ===== Dashboard Types =====
export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
  layout: LayoutItem[];
  localLastModified?: string;
  serverLastModified?: string | null;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  widgets: Widget[];
  layout: LayoutItem[];
  category: string;
}

// ===== Status Types =====
export interface ServiceStatus {
  status: string;
  statusText: string;
  statusColor: string;
  details: Record<string, unknown>;
}

export interface SystemStatus {
  database: ServiceStatus;
  opcua: ServiceStatus;
  overall: ServiceStatus;
  lastUpdated?: string;
}

// ===== Time Range Types =====
export type TimeRangePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  start: Date;
  end: Date;
  label: string;
}

// ===== Notification Types =====
export interface Notification {
  id: string;
  type: 'alarm' | 'status' | 'system' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  source?: string;
}

// ===== Annotation Types =====
export interface Annotation {
  id: string;
  widgetId: string;
  text: string;
  timestamp: Date;
  color: string;
  createdAt: Date;
}

// ===== KPI Types =====
export interface KpiData {
  activeAlarms: number;
  uptimePercent: number;
  airConsumption: number;
  systemStatus: 'healthy' | 'degraded' | 'error';
  dbStatus: string;
  opcuaStatus: string;
}

// ===== Machine Types =====
export interface Machine {
  id: number;
  name: string;
  endpoint_url: string;
  ip: string;
  port: number;
  resource_path: string;
  security_mode: string;
  security_policy: string;
  is_active: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  mappingCount?: number;
}

export interface NodeMapping {
  id: number;
  machine_id: number;
  node_id: string;
  node_key: string;
  display_name: string;
  data_type: string;
  sampling_interval: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrowsedNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  isForward: boolean;
}

export interface MachineFormData {
  name: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
}

// ===== Export Types =====
export type ExportFormat = 'png' | 'svg' | 'csv';
