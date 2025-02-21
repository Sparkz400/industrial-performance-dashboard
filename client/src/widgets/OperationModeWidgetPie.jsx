import React, { useState } from 'react';
import { Card, CardContent, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const COLORS = ['#8884d8', '#FF8042', '#0088FE', '#00C49F', '#FFBB28', '#FF4444'];

const generateDummyPieDataToday = () => {
    return [
        { name: "Off", value: 5 },
        { name: "Error State", value: 5 },
        { name: "Setup Mode", value: 10 },
        { name: "Auto (Not Started)", value: 20 },
        { name: "Auto (Started & Idle)", value: 30 },
        { name: "Auto (In Production)", value: 30 }
    ];
};

const generateDummyPieDataTotal = () => {
    return [
        { name: "Off", value: 10 },
        { name: "Error State", value: 5 },
        { name: "Setup Mode", value: 15 },
        { name: "Auto (Not Started)", value: 20 },
        { name: "Auto (Started & Idle)", value: 25 },
        { name: "Auto (In Production)", value: 25 }
    ];
};

const OperationModePieWidget = ({ config }) => {
    const [view, setView] = useState("total");

    const handleViewChange = (event, newView) => {
        if (newView !== null) {
            setView(newView);
        }
    };

    // Choose data based on the selected view.
    const data = view === 'today' ? generateDummyPieDataToday() : generateDummyPieDataTotal();

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
