import React, {useState} from 'react';
import {Responsive, WidthProvider} from 'react-grid-layout';
import {widgetRegistry} from '../widgets/WidgetRegistry';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetButton from '../components/dashboard/addWidgetButton';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import WidgetPreviewPopup from "../components/dashboard/WidgetPreviewPopup";

const ResponsiveGridLayout = WidthProvider(Responsive);

function renderWidget(widget) {
    const widgetMeta = widgetRegistry[widget.type];
    if (!widgetMeta) {
        return <div>Unknown widget type: {widget.type}</div>;
    }
    const WidgetComponent = widgetMeta.component;
    return <WidgetComponent config={widget.config} />;
}

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
                w: widgetMeta.minW  || 4,
                h: widgetMeta.minH || 4,
                minW: widgetMeta.minW || 2,
                minH: widgetMeta.minH || 2
            }
        ]);
    };

    const removeWidget = (id) => {
        setWidgets((prev) => {
            return prev.filter((w) => w.id !== id);
        });

        setLayout((prev) => {
            return prev.filter((item) => item.i !== id);
        });
    };

    const openWidgetSelectionDialog = () => {
        setPreviewOpen(true);
    };

    const handleWidgetSelect = (widgetType) => {
        addWidget(widgetType);
        setPreviewOpen(false);
    };

    return (
        <div style={{ padding: '1rem' , width: '100%'}}>
            <h2>Dashboard</h2>

            {/* The grid layout */}
            <ResponsiveGridLayout
                draggableCancel=".MuiIconButton-root, .no-drag"
                className="layout"
                layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                rowHeight={35}
                onLayoutChange={(currentLayout) => {
                    setLayout(currentLayout);
                }}
            >
                {widgets.map((widget) => {
                    // Find the layout object for this widget by matching the id.
                    const layoutItem = layout.find((item) => item.i === widget.id);
                    return (
                        <div
                            key={widget.id}
                            style={{
                                border: '1px solid #444',
                                background: '#1e1e1e',
                                position: 'relative',
                            }}
                        >
                            <IconButton
                                onClick={() => removeWidget(widget.id)}
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    zIndex: 5,
                                    cursor: 'pointer',
                                    color: '#fff',
                                }}
                            >
                                <DeleteIcon />
                            </IconButton>
                            {renderWidget(widget)}
                            {/* Debug overlay showing the current width (w) and height (h) */}
                            {layoutItem && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        bottom: '2px',
                                        left: '2px',
                                        fontSize: '10px',
                                        color: 'white',
                                        background: 'rgba(0, 0, 0, 0.5)',
                                        padding: '2px 4px',
                                        borderRadius: '2px',
                                    }}
                                >
                                    {`w: ${layoutItem.w}, h: ${layoutItem.h}`}
                                </div>
                            )}
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
