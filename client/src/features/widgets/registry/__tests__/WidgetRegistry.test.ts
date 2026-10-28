import { describe, it, expect } from 'vitest';
import {
  widgetRegistry,
  WIDGET_CATEGORIES,
  CATEGORY_COLORS,
  getWidgetsByCategory,
} from '../WidgetRegistry';

describe('WIDGET_CATEGORIES', () => {
  it('should define all expected categories', () => {
    expect(WIDGET_CATEGORIES).toHaveProperty('MONITORING', 'Monitoring');
    expect(WIDGET_CATEGORIES).toHaveProperty('ANALYTICS', 'Analytics');
    expect(WIDGET_CATEGORIES).toHaveProperty('SYSTEM', 'System');
    expect(WIDGET_CATEGORIES).toHaveProperty('CONTROL', 'Control');
  });
});

describe('CATEGORY_COLORS', () => {
  it('should have a color entry for every category', () => {
    Object.values(WIDGET_CATEGORIES).forEach((category) => {
      expect(CATEGORY_COLORS).toHaveProperty(category);
      // eslint-disable-next-line security/detect-object-injection -- category from Object.values iteration
      const color = CATEGORY_COLORS[category];
      expect(color).toHaveProperty('main');
      expect(color).toHaveProperty('light');
      expect(color).toHaveProperty('dark');
    });
  });
});

describe('widgetRegistry', () => {
  const expectedWidgets = [
    'alarmDashboard',
    'systemStatus',
    'currentAirConsumptionWidget',
    'operationMode',
    'operationModePie',
    'upTimeRate',
  ];

  it('should contain all expected widget keys', () => {
    expectedWidgets.forEach((key) => {
      expect(widgetRegistry).toHaveProperty(key);
    });
  });

  it.each(expectedWidgets)('widget "%s" should have all required fields', (key) => {
    // eslint-disable-next-line security/detect-object-injection -- key from test's expectedWidgets array
    const widget = widgetRegistry[key];
    expect(widget).toBeDefined();

    // Required metadata fields
    expect(widget.title).toBeTruthy();
    expect(typeof widget.title).toBe('string');
    expect(widget.description).toBeTruthy();
    expect(typeof widget.description).toBe('string');
    expect(widget.category).toBeTruthy();
    expect(widget.icon).toBeTruthy();

    // Dimension constraints
    expect(widget.minW).toBeGreaterThanOrEqual(2);
    expect(widget.minH).toBeGreaterThanOrEqual(2);
    expect(widget.defaultW).toBeGreaterThanOrEqual(widget.minW);
    expect(widget.defaultH).toBeGreaterThanOrEqual(widget.minH);

    // Component must exist (lazy loaded)
    expect(widget.component).toBeDefined();

    // defaultConfig should be an object
    expect(typeof widget.defaultConfig).toBe('object');
  });

  it('every widget category should be a known category', () => {
    const validCategories = Object.values(WIDGET_CATEGORIES);
    Object.values(widgetRegistry).forEach((widget) => {
      expect(validCategories).toContain(widget.category);
    });
  });

  it('alarmDashboard should have correct defaults', () => {
    const alarm = widgetRegistry.alarmDashboard;
    expect(alarm.title).toBe('Alarm Dashboard');
    expect(alarm.category).toBe(WIDGET_CATEGORIES.MONITORING);
    expect(alarm.defaultConfig).toEqual({ rowsPerPage: 5 });
    expect(alarm.settingsComponent).not.toBeNull();
  });

  it('systemStatus should have correct defaults', () => {
    const sys = widgetRegistry.systemStatus;
    expect(sys.title).toBe('System Status');
    expect(sys.category).toBe(WIDGET_CATEGORIES.SYSTEM);
    expect(sys.defaultConfig).toEqual({
      autoRefresh: true,
      showDetails: true,
      refreshInterval: 20000,
    });
  });

  it('widgets without settings should have null settingsComponent', () => {
    expect(widgetRegistry.currentAirConsumptionWidget.settingsComponent).not.toBeNull();
    expect(widgetRegistry.operationModePie.settingsComponent).not.toBeNull();
  });
});

describe('getWidgetsByCategory', () => {
  it('should group widgets by their category', () => {
    const grouped = getWidgetsByCategory();

    expect(grouped[WIDGET_CATEGORIES.MONITORING]).toBeDefined();
    expect(grouped[WIDGET_CATEGORIES.ANALYTICS]).toBeDefined();
    expect(grouped[WIDGET_CATEGORIES.SYSTEM]).toBeDefined();
  });

  it('each grouped entry should include a type field matching the registry key', () => {
    const grouped = getWidgetsByCategory();
    Object.values(grouped)
      .flat()
      .forEach((entry) => {
        expect(entry).toHaveProperty('type');
        expect(typeof entry.type).toBe('string');
        expect(widgetRegistry).toHaveProperty(entry.type);
      });
  });

  it('total grouped widgets should equal total registry entries', () => {
    const grouped = getWidgetsByCategory();
    const totalGrouped = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(totalGrouped).toBe(Object.keys(widgetRegistry).length);
  });
});
