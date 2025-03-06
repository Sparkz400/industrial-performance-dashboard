import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer
} from 'recharts';

const UptimeLineChartWidget = ({ config }) => {
    // Use the custom expected uptime if provided, default to 99%
    const expectedUptime = config.expectedUptime || 99;

    // Generate data for the last 7 calendar days.
    // For demo purposes, uptime is generated randomly (between 80 and 100).
    // Replace this with your own data-fetching logic if needed.
    const uptimeData = React.useMemo(() => {
        const today = new Date();
        const data = [];
        // Generate 7 days worth of data, from oldest (6 days ago) to newest (today)
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');

            data.push({
                day: `${dd}.${mm}`, // e.g. "21.02"
                uptime: parseFloat((80 + Math.random() * 20).toFixed(1)),
            });
        }
        return data;
    }, []);

    // Combine uptime values plus the expected uptime
    const allValues = [
        ...uptimeData.map(d => d.uptime),
        expectedUptime
    ];

    // Dynamically compute min & max from both the real data and the expected uptime
    const minUptime = Math.min(...allValues);
    const maxUptime = Math.max(...allValues);

    // A little padding on both ends, clamped to [0, 100]
    const domainMin = Math.max(minUptime - 0.5, 0);
    const domainMax = Math.min(maxUptime + 0.5, 100);

    return (
        <Card sx={{ boxShadow: 3, borderRadius: 2 }} style={{ width: '100%', height: '100%' }}>
            <CardContent style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                    Uptime Rate (Last 7 Days)
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={uptimeData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis
                            domain={[domainMin, domainMax]}
                            tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="uptime"
                            stroke="#8884d8"
                            activeDot={{ r: 8 }}
                        />
                        <ReferenceLine
                            y={expectedUptime}
                            label="Expected Uptime"
                            stroke="red"
                            strokeDasharray="3 3"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default UptimeLineChartWidget;
