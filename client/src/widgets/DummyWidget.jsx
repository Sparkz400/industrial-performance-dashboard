import React from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';

function DummyWidget({ config }) {
    const data = [
        { name: 'A', value: 3 },
        { name: 'B', value: 7 },
        { name: 'C', value: 1 },
        { name: 'D', value: 5 },
        { name: 'E', value: 2 },
    ];

    return (
        // Let the parent (react-grid-layout cell) define this box’s size,
        // and ResponsiveContainer will fill 100% of that space.
        <div style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#8884d8"
                        strokeWidth={2}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default DummyWidget;
