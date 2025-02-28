import React, { useState, useMemo } from 'react';
import { Card, CardContent, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const COLORS = [
    '#6e6e70',
    '#ea2e2e',
    '#61503d',
    '#00C49F',
    '#90aa74',
    '#41af48'
];

// Moved data generation outside component to prevent re-creation on each render
const generateDummyPieDataToday = () => [
    { name: "Off", value: 5 },
    { name: "Error State", value: 5 },
    { name: "Setup Mode", value: 10 },
    { name: "Auto (Not Started)", value: 20 },
    { name: "Auto (Started & Idle)", value: 30 },
    { name: "Auto (In Production)", value: 30 }
];

const generateDummyPieDataTotal = () => [
    { name: "Off", value: 10 },
    { name: "Error State", value: 5 },
    { name: "Setup Mode", value: 15 },
    { name: "Auto (Not Started)", value: 20 },
    { name: "Auto (Started & Idle)", value: 25 },
    { name: "Auto (In Production)", value: 25 }
];

const TODAY_DATA = generateDummyPieDataToday();
const TOTAL_DATA = generateDummyPieDataTotal();

const OperationModePieWidget = () => {
    const [view, setView] = useState("total");

    const handleViewChange = (event, newView) => {
        if (newView !== null) {
            setView(newView);
        }
    };

    // Proper memoization
    const data = useMemo(() => {
        return view === 'today' ? TODAY_DATA : TOTAL_DATA;
    }, [view]);

    return (
        <Card style={{ width: '100%', height: '100%' }}>
            <CardContent style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>
                    Operation Mode Distribution
                </Typography>
                {/* Toggle between Today and Total */}
                <ToggleButtonGroup
                    value={view}
                    exclusive
                    onChange={handleViewChange}
                    size="small"
                    style={{ marginBottom: '0.5rem' }}
                >
                    <ToggleButton className="no-drag" value="today">Today</ToggleButton>
                    <ToggleButton className="no-drag" value="total">Total</ToggleButton>
                </ToggleButtonGroup>
                <div style={{ flexGrow: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius="80%"
                                label
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <Typography variant="body2" color="textSecondary">
                    Shows the overall operation mode distribution for {view === 'today' ? "today" : "the entire operating period"}.
                </Typography>
            </CardContent>
        </Card>
    );
};

export default OperationModePieWidget;