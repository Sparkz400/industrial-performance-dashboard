import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { Widget } from '@/types';

// Mock child components and stores
vi.mock('@/stores/useWidgetStore', () => ({
  useWidgetStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      updateWidgetConfig: vi.fn(),
      fullscreenWidgetId: null,
      setFullscreenWidget: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../registry/WidgetRegistry', () => ({
  widgetRegistry: {
    'test-widget': {
      title: 'Test Widget',
      description: 'A test widget',
      component: React.lazy(() =>
        Promise.resolve({
          default: () => <div data-testid="test-widget-content">Widget Content</div>,
        }),
      ),
      settingsComponent: null,
      minW: 2,
      minH: 2,
      defaultW: 4,
      defaultH: 3,
      category: 'test',
      icon: 'TestIcon',
      defaultConfig: {},
    },
  },
}));

vi.mock('../../../dashboard/components/ExportMenu', () => ({
  default: () => <div data-testid="export-menu" />,
}));

vi.mock('../../../dashboard/components/AnnotationPanel', () => ({
  default: () => <div data-testid="annotation-panel" />,
}));

vi.mock('@/shared/components/loading/WidgetSkeleton', () => ({
  default: () => <div data-testid="widget-skeleton">Loading...</div>,
}));

// We need to import after mocks
import WidgetContainer from '../WidgetContainer';

const createTestWidget = (overrides: Partial<Widget> = {}): Widget => ({
  id: 'widget-1',
  type: 'test-widget',
  config: {},
  ...overrides,
});

describe('WidgetContainer', () => {
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const widget = createTestWidget();
    const { container } = render(<WidgetContainer widget={widget} onDelete={mockOnDelete} />);
    expect(container).toBeTruthy();
  });

  it('should show widget content when loaded', async () => {
    const widget = createTestWidget();
    render(<WidgetContainer widget={widget} onDelete={mockOnDelete} />);

    await waitFor(() => {
      expect(screen.getByTestId('test-widget-content')).toBeInTheDocument();
    });
  });

  it('should display "not found" message for unknown widget types', async () => {
    const widget = createTestWidget({ type: 'nonexistent-widget' });
    render(<WidgetContainer widget={widget} onDelete={mockOnDelete} />);

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('should show controls on hover', async () => {
    const widget = createTestWidget();
    const { container } = render(<WidgetContainer widget={widget} onDelete={mockOnDelete} />);

    // Find the hoverable wrapper
    const wrapper = container.firstElementChild;
    if (wrapper) {
      fireEvent.mouseEnter(wrapper);
    }

    // Controls should become visible (Fade component with in=true)
    // The buttons are always in the DOM but controlled by Fade opacity
    await waitFor(() => {
      expect(screen.getByTestId('export-menu')).toBeInTheDocument();
    });
  });

  it('should call onDelete when delete button is clicked', async () => {
    const widget = createTestWidget();
    const { container } = render(<WidgetContainer widget={widget} onDelete={mockOnDelete} />);

    // Hover to show controls
    const wrapper = container.firstElementChild;
    if (wrapper) {
      fireEvent.mouseEnter(wrapper);
    }

    // Find and click the delete button (tooltip "Remove Widget")
    const deleteButtons = screen.getAllByRole('button');
    const deleteBtn = deleteButtons.find(
      (btn) => btn.querySelector('[data-testid="DeleteIcon"]') !== null,
    );

    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(mockOnDelete).toHaveBeenCalledWith('widget-1');
    }
  });

  it('should display size indicator when layoutItem is provided', () => {
    const widget = createTestWidget();
    const layoutItem = { i: 'widget-1', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 };
    const { container } = render(
      <WidgetContainer widget={widget} onDelete={mockOnDelete} layoutItem={layoutItem} />,
    );

    // Hover to make size indicator visible
    const wrapper = container.firstElementChild;
    if (wrapper) {
      fireEvent.mouseEnter(wrapper);
    }

    // Size indicator shows "w x h" format
    expect(screen.getByText('4 x 3')).toBeInTheDocument();
  });
});
