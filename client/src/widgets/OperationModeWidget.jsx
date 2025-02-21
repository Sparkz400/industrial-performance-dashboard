import React, { useState, useEffect } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Brush
} from 'recharts';
import { Card, CardContent, Typography } from '@mui/material';

// Mapping numeric values to operation mode labels.
const modeMapping = {
    0: "Off",
    1: "Error State",
    2: "Setup Mode",
    3: "Auto (Not Started)",
    4: "Auto (Started & Idle)",
    5: "Auto (In Production)"
};

const generateInitialData = () => {
    const data = [];
    const now = new Date();
    // Generate one data point per minute for the past 2 hours (120 minutes) as an example.
    const numPoints = 120;
    for (let i = numPoints; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60000);
        // For demonstration, randomly pick a mode from 0 to 5.
        const mode = Math.floor(Math.random() * 6);
        data.push({
            time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode
        });
    }
    return data;
};

const OperationModeWidget = ({ config }) => {
    const [data, setData] = useState(generateInitialData());

    // Update every minute by shifting out the oldest value and adding a new one.
    useEffect(() => {
        const interval = setInterval(() => {
            setData(prevData => {
                const newData = [...prevData];
                newData.shift();
                const now = new Date();
                const mode = Math.floor(Math.random() * 6);
                newData.push({
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    mode
                });
                return newData;
            });
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // Tooltip formatter to show text labels.
    const tooltipFormatter = (value, name) => {
        if (name === "mode") {
            return modeMapping[value];
        }
        return value;
    };

    // Y-axis tick formatter to display mode labels.
    const yTickFormatter = (value) => modeMapping[value];

    // Generate ticks for all possible modes.
    const yTicks = [0, 1, 2, 3, 4, 5];

    return (
        <Card style={{ width: '100%', height: '100%' }}>
            <CardContent style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                    Operation Mode Over Time
                </Typography>
                <div style={{ flexGrow: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" minTickGap={20} />
                            <YAxis tickFormatter={yTickFormatter} ticks={yTicks} domain={[0, 5]} />
                            <Tooltip formatter={tooltipFormatter} />
                            <Legend />
                            <Line
                                type="step"
                                dataKey="mode"
                                stroke="#82ca9d"
                                strokeWidth={2}
                                name="Operation Mode"
                                dot
                            />
                            <Brush className="no-drag" dataKey="time" height={30} stroke="#82ca9d" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <Typography variant="body2" color="textSecondary">
                    Displays operation mode transitions. Use the brush to navigate.
                </Typography>
            </CardContent>
        </Card>
    );
};

export default OperationModeWidget;
