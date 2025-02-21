import React, { useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { widgetRegistry } from '../widgets/WidgetRegistry';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetButton from '../components/dashboard/addWidgetButton';
import WidgetPreviewPopup from '../components/dashboard/WidgetPreviewPopup';
import WidgetContainer from '../components/dashboard/WidgetContainer';

const ResponsiveGridLayout = WidthProvider(Responsive);

function DashboardPage() {
    const [widgets, setWidgets] = useState([]);
    const [layout, setLayout] = useState([]);
    const [previewOpen, setPreviewOpen] = useState(false);

    const addWidget = (widgetType) => {
        const newId = 'widget-' + Date.now();
        const widgetMeta = widgetRegistry[widgetType];

        setWidgets((prev) => [
            ...prev,
            { id: newId, type: widgetType, config: {} }
        ]);

        setLayout((prev) => [
            ...prev,
            {
                i: newId,
                x: 0,
                y: 0,
                w: widgetMeta.minW || 4,
                h: widgetMeta.minH || 4,
                minW: widgetMeta.minW || 2,
                minH: widgetMeta.minH || 2,
            }
        ]);
    };

    const removeWidget = (id) => {
        setWidgets((prev) => prev.filter((w) => w.id !== id));
        setLayout((prev) => prev.filter((item) => item.i !== id));
    };

    const openWidgetSelectionDialog = () => {
        setPreviewOpen(true);
    };

    const handleWidgetSelect = (widgetType) => {
        addWidget(widgetType);
        setPreviewOpen(false);
    };

    const updateWidgetConfig = (widgetId, newConfig) => {
        setWidgets((prevWidgets) =>
            prevWidgets.map((w) =>
                w.id === widgetId ? { ...w, config: newConfig } : w
            )
        );
    };

    return (
        <div style={{ padding: '1rem', width: '100%' }}>
            <h2>Dashboard</h2>

            {/* The grid layout */}
            <ResponsiveGridLayout
                draggableCancel=".MuiIconButton-root, .no-drag"
                className="layout"
                layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                rowHeight={35}
                onLayoutChange={(currentLayout) => setLayout(currentLayout)}
            >
                {widgets.map((widget) => {
                    // Find the layout object for this widget by matching the id.
                    const layoutItem = layout.find((item) => item.i === widget.id);
                    return (
                        <div key={widget.id}>
                            <WidgetContainer
                                widget={widget}
                                onDelete={() => removeWidget(widget.id)}
                                widgetRegistry={widgetRegistry}
                                layoutItem={layoutItem}
                                onUpdateWidgetConfig={updateWidgetConfig}
                            />
                        </div>
                    );
                })}
            </ResponsiveGridLayout>

            <AddWidgetButton onClick={openWidgetSelectionDialog} />

            <WidgetPreviewPopup
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                onSelect={handleWidgetSelect}
            />
        </div>
    );
}

export default DashboardPage;
