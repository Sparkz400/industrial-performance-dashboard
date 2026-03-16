/**
 * Performance Dashboard — Custom Widget SDK
 *
 * This SDK defines the contract for external widget developers.
 * A custom widget is loaded via an iframe that communicates with
 * the host dashboard using postMessage.
 *
 * ## Widget Manifest (widget-manifest.json)
 *
 * Custom widgets must serve a JSON manifest at a public URL:
 *
 * ```json
 * {
 *   "id": "my-custom-widget",
 *   "name": "My Custom Widget",
 *   "description": "Displays custom data visualization",
 *   "version": "1.0.0",
 *   "author": "Your Company",
 *   "category": "Custom",
 *   "icon": "Extension",
 *   "entryUrl": "https://your-cdn.com/widgets/my-widget/index.html",
 *   "defaultConfig": { "refreshInterval": 30000 },
 *   "defaultW": 4,
 *   "defaultH": 6,
 *   "minW": 2,
 *   "minH": 2,
 *   "settingsSchema": [
 *     { "key": "refreshInterval", "label": "Refresh Interval (ms)", "type": "number", "defaultValue": 30000 },
 *     { "key": "showTitle", "label": "Show Title", "type": "boolean", "defaultValue": true }
 *   ]
 * }
 * ```
 *
 * ## Widget Entry Point (index.html)
 *
 * The widget's entryUrl should load an HTML page that:
 * 1. Listens for `message` events from the parent
 * 2. Renders content based on config and data
 * 3. Posts events back to the parent
 *
 * ## Message Protocol
 *
 * Parent → Widget:
 * - { type: "init", config: {...}, theme: "dark"|"light" }
 * - { type: "config-update", config: {...} }
 * - { type: "data-update", data: {...} }
 * - { type: "resize", width: number, height: number }
 *
 * Widget → Parent:
 * - { type: "ready" }
 * - { type: "request-data", query: {...} }
 * - { type: "error", message: string }
 * - { type: "config-change", config: {...} }
 */

// Message types from parent to widget
export interface WidgetInitMessage {
  type: 'init';
  config: Record<string, unknown>;
  theme: 'dark' | 'light';
  widgetId: string;
}

export interface WidgetConfigUpdateMessage {
  type: 'config-update';
  config: Record<string, unknown>;
}

export interface WidgetDataUpdateMessage {
  type: 'data-update';
  data: unknown;
}

export interface WidgetResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

export type ParentToWidgetMessage =
  | WidgetInitMessage
  | WidgetConfigUpdateMessage
  | WidgetDataUpdateMessage
  | WidgetResizeMessage;

// Message types from widget to parent
export interface WidgetReadyMessage {
  type: 'ready';
}

export interface WidgetRequestDataMessage {
  type: 'request-data';
  query: Record<string, unknown>;
}

export interface WidgetErrorMessage {
  type: 'error';
  message: string;
}

export interface WidgetConfigChangeMessage {
  type: 'config-change';
  config: Record<string, unknown>;
}

export type WidgetToParentMessage =
  | WidgetReadyMessage
  | WidgetRequestDataMessage
  | WidgetErrorMessage
  | WidgetConfigChangeMessage;

/**
 * Helper class for widget developers to simplify communication with the host.
 * Include this in your widget's index.html via a <script> tag or import.
 *
 * Usage:
 * ```js
 * const sdk = new DashboardWidgetSDK();
 *
 * sdk.onInit((config, theme) => {
 *   // Initialize your widget with the given config
 * });
 *
 * sdk.onConfigUpdate((newConfig) => {
 *   // Re-render with new config
 * });
 *
 * sdk.onResize((width, height) => {
 *   // Handle resize
 * });
 * ```
 */
export class DashboardWidgetSDK {
  private initHandler?: (config: Record<string, unknown>, theme: string) => void;
  private configUpdateHandler?: (config: Record<string, unknown>) => void;
  private dataUpdateHandler?: (data: unknown) => void;
  private resizeHandler?: (width: number, height: number) => void;

  constructor() {
    window.addEventListener('message', this.handleMessage.bind(this));
    // Signal readiness
    this.postToParent({ type: 'ready' });
  }

  private handleMessage(event: MessageEvent) {
    const msg = event.data as ParentToWidgetMessage;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'init':
        this.initHandler?.(msg.config, msg.theme);
        break;
      case 'config-update':
        this.configUpdateHandler?.(msg.config);
        break;
      case 'data-update':
        this.dataUpdateHandler?.(msg.data);
        break;
      case 'resize':
        this.resizeHandler?.(msg.width, msg.height);
        break;
    }
  }

  onInit(handler: (config: Record<string, unknown>, theme: string) => void) {
    this.initHandler = handler;
  }

  onConfigUpdate(handler: (config: Record<string, unknown>) => void) {
    this.configUpdateHandler = handler;
  }

  onDataUpdate(handler: (data: unknown) => void) {
    this.dataUpdateHandler = handler;
  }

  onResize(handler: (width: number, height: number) => void) {
    this.resizeHandler = handler;
  }

  requestData(query: Record<string, unknown>) {
    this.postToParent({ type: 'request-data', query });
  }

  reportError(message: string) {
    this.postToParent({ type: 'error', message });
  }

  updateConfig(config: Record<string, unknown>) {
    this.postToParent({ type: 'config-change', config });
  }

  private postToParent(message: WidgetToParentMessage) {
    if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage.bind(this));
  }
}
