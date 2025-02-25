import React, { useState, useEffect } from 'react';
import { CircularProgress, Tabs, Tab, Box, IconButton, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { widgetRegistry } from '../widgets/StandardComponents/WidgetRegistry.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetButton from '../components/dashboard/addWidgetButton.jsx';
import WidgetPreviewPopup from '../components/dashboard/WidgetPreviewPopup.jsx';
import WidgetContainer from '../widgets/StandardComponents/WidgetContainer.jsx';

const ResponsiveGridLayout = WidthProvider(Responsive);

function DashboardPage() {
    const [dashboards, setDashboards] = useState([]);
    const [selectedDashboardId, setSelectedDashboardId] = useState(null);
    const [editingDashboardId, setEditingDashboardId] = useState(null);
    const [widgets, setWidgets] = useState([]);
    const [layout, setLayout] = useState([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [initialized, setInitialized] = useState(false);

    // --- Widget Management ---
    const addWidget = (widgetType) => {
        const newId = 'widget-' + Date.now();
        const widgetMeta = widgetRegistry[widgetType];
        setWidgets(prev => [...prev, { id: newId, type: widgetType, config: {} }]);
        setLayout(prev => [
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
        setWidgets(prev => prev.filter(w => w.id !== id));
        setLayout(prev => prev.filter(item => item.i !== id));
    };

    const openWidgetSelectionDialog = () => {
        setPreviewOpen(true);
    };

    const handleWidgetSelect = (widgetType) => {
        addWidget(widgetType);
        setPreviewOpen(false);
    };

    const updateWidgetConfig = (widgetId, newConfig) => {
        setWidgets(prevWidgets =>
            prevWidgets.map(w =>
                w.id === widgetId ? { ...w, config: newConfig } : w
            )
        );
    };

    // --- Dashboard Management ---
    const handleAddDashboard = async () => {
        const newDashboard = {
            id: 'dashboard-' + Date.now(),
            name: 'New Dashboard',
            widgets: [],
            layout: []
        };
        setDashboards(prev => [...prev, newDashboard]);
        setSelectedDashboardId(newDashboard.id);
        setWidgets([]);
        setLayout([]);
        await persistDashboardState(newDashboard);
    };

    const handleDeleteDashboard = async (dashboardId) => {
        try {
            await fetch(`http://localhost:3000/api/dashboards/${dashboardId}`, { method: 'DELETE' });
        } catch (error) {}
        const newDashboards = dashboards.filter(d => d.id !== dashboardId);
        setDashboards(newDashboards);
        if (newDashboards.length > 0) {
            setSelectedDashboardId(newDashboards[0].id);
            setWidgets(newDashboards[0].widgets || []);
            setLayout(newDashboards[0].layout || []);
        } else {
            handleAddDashboard();
        }
    };

    const handleSelectDashboard = (event, newIndex) => {
        const selectedDashboard = dashboards[newIndex];
        if (selectedDashboard) {
            setSelectedDashboardId(selectedDashboard.id);
            setWidgets(selectedDashboard.widgets || []);
            setLayout(selectedDashboard.layout || []);
        }
    };

    const handleRenameDashboard = (dashboardId, newName) => {
        setDashboards(prev =>
            prev.map(d => d.id === dashboardId ? { ...d, name: newName } : d)
        );
        const dashboard = dashboards.find(d => d.id === dashboardId);
        if (dashboard) {
            persistDashboardState({ ...dashboard, name: newName, widgets, layout });
        }
    };

    // --- Persistence Functions ---
    async function saveDashboardToDB(dashboard) {
        const response = await fetch(`http://localhost:3000/api/dashboards/${dashboard.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dashboard)
        });
        if (!response.ok) {
            throw new Error('Failed to save dashboard to DB');
        }
        return response.json();
    }

    async function persistDashboardState(dashboard) {
        try {
            await saveDashboardToDB(dashboard);
        } catch (error) {}
    }

    // Write the entire dashboards array to local storage whenever it changes
    useEffect(() => {
        if (!initialized) return;
        const handler = setTimeout(() => {
            localStorage.setItem('dashboards', JSON.stringify(dashboards));
        }, 1000); // Debounce delay of 1 second.
        return () => clearTimeout(handler);
    }, [dashboards, initialized]);

    // Persist current dashboard state on widget/layout change (after initialization)
    useEffect(() => {
        if (!initialized) return;
        const currentDashboard = dashboards.find(d => d.id === selectedDashboardId) || { id: selectedDashboardId };
        const updatedDashboard = { ...currentDashboard, widgets, layout };
        setDashboards(prev =>
            prev.map(d => d.id === selectedDashboardId ? updatedDashboard : d)
        );
        persistDashboardState(updatedDashboard);
    }, [widgets, layout, initialized, selectedDashboardId]);

    // Load dashboards from backend on mount; if it fails, load from local storage,
    // and if that fails, create a default dashboard.
    useEffect(() => {
        async function loadDashboards() {
            try {
                const res = await fetch('http://localhost:3000/api/dashboards');
                if (res.ok) {
                    const dashboardsData = await res.json();
                    if (dashboardsData.length > 0) {
                        setDashboards(dashboardsData);
                        setSelectedDashboardId(dashboardsData[0].id);
                        setWidgets(dashboardsData[0].widgets || []);
                        setLayout(dashboardsData[0].layout || []);
                    } else {
                        throw new Error('No dashboards found in backend');
                    }
                } else {
                    throw new Error('No dashboards found in backend');
                }
            } catch (error) {
                const localData = localStorage.getItem('dashboards');
                if (localData) {
                    try {
                        const localDashboards = JSON.parse(localData);
                        if (localDashboards.length > 0) {
                            setDashboards(localDashboards);
                            setSelectedDashboardId(localDashboards[0].id);
                            setWidgets(localDashboards[0].widgets || []);
                            setLayout(localDashboards[0].layout || []);
                        } else {
                            const defaultDashboard = { id: 'dashboard-' + Date.now(), name: 'My Dashboard', widgets: [], layout: [] };
                            setDashboards([defaultDashboard]);
                            setSelectedDashboardId(defaultDashboard.id);
                            setWidgets([]);
                            setLayout([]);
                        }
                    } catch (parseError) {
                        const defaultDashboard = { id: 'dashboard-' + Date.now(), name: 'My Dashboard', widgets: [], layout: [] };
                        setDashboards([defaultDashboard]);
                        setSelectedDashboardId(defaultDashboard.id);
                        setWidgets([]);
                        setLayout([]);
                    }
                } else {
                    // If no local storage exists, create a default dashboard
                    const defaultDashboard = { id: 'dashboard-' + Date.now(), name: 'My Dashboard', widgets: [], layout: [] };
                    setDashboards([defaultDashboard]);
                    setSelectedDashboardId(defaultDashboard.id);
                    setWidgets([]);
                    setLayout([]);
                }
            } finally {
                setInitialized(true);
            }
        }
        loadDashboards();
    }, []);

    // Periodically sync local storage to backend if possible
    useEffect(() => {
        async function syncLocalState() {
            const localData = localStorage.getItem('dashboards');
            if (localData) {
                try {
                    const localDashboards = JSON.parse(localData);
                    for (const dashboard of localDashboards) {
                        await saveDashboardToDB(dashboard);
                    }
                } catch (error) {}
            }
        }
        const interval = setInterval(syncLocalState, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!initialized) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <CircularProgress color="secondary" />
            </div>
        );
    }

    // Determine selected tab index from selectedDashboardId
    const selectedIndex = dashboards.findIndex(d => d.id === selectedDashboardId);

    return (
        <div style={{ padding: '1rem', width: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
                <Tabs
                    value={selectedIndex}
                    onChange={handleSelectDashboard}
                    variant="scrollable"
                    scrollButtons="auto"
                >
                    {dashboards.map((dashboard, index) => (
                        <Tab
                            key={dashboard.id}
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center'}}>
                                    {editingDashboardId === dashboard.id ? (
                                        <TextField
                                            value={dashboard.name}
                                            onChange={(e) => handleRenameDashboard(dashboard.id, e.target.value)}
                                            onBlur={() => setEditingDashboardId(null)}
                                            autoFocus
                                            variant="standard"
                                            sx={{color: "#ffffff"}}
                                        />
                                    ) : (
                                        <span onDoubleClick={() => setEditingDashboardId(dashboard.id)}
                                        style={{ color: selectedIndex === index ? '#53b4f3' : 'inherit' }}>
                                            {dashboard.name}
                                        </span>
                                    )}
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteDashboard(dashboard.id);
                                        }}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            }

                        />
                    ))}
                </Tabs>
                <IconButton onClick={handleAddDashboard}>
                    <AddIcon />
                </IconButton>
            </Box>
            <ResponsiveGridLayout
                draggableCancel=".MuiIconButton-root, .no-drag"
                className="layout"
                layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                rowHeight={35}
                onLayoutChange={(currentLayout) => setLayout(currentLayout)}
            >
                {widgets.map(widget => {
                    const layoutItem = layout.find(item => item.i === widget.id);
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
