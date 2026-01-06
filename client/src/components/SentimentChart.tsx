import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

type SentimentKey = 'Positive' | 'Neutral' | 'Negative';

interface SentimentDatum {
    name: SentimentKey | string;
    value: number;
    [key: string]: any;
}

interface SentimentChartProps {
    data: SentimentDatum[];
    title?: string;
    subtitle?: string;
}

const COLORS: Record<SentimentKey, string> = {
    Positive: '#10B981', // Emerald Green
    Neutral: '#6B7280',  // Slate Gray
    Negative: '#EF4444'  // Rose Red
};

// Custom tooltip for better UX
const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white px-4 py-3 shadow-lg rounded-lg border border-gray-200">
                <p className="font-semibold text-gray-800">{data.name}</p>
                <p className="text-gray-600">
                    <span className="font-bold text-lg">{data.value}</span> posts
                </p>
            </div>
        );
    }
    return null;
};

// Custom legend with percentages
const CustomLegend = ({ payload, data }: any) => {
    const total = data.reduce((sum: number, item: SentimentDatum) => sum + item.value, 0);

    return (
        <div className="flex justify-center gap-6 mt-4">
            {payload.map((entry: any, index: number) => {
                const percentage = total > 0 ? ((entry.payload.value / total) * 100).toFixed(1) : 0;
                return (
                    <div key={`legend-${index}`} className="flex items-center gap-2">
                        <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-sm text-gray-700 font-medium">
                            {entry.value}: {percentage}%
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const SentimentChart: React.FC<SentimentChartProps> = ({ data, title, subtitle }) => {
    // Calculate total for center label
    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Guard against empty data
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-80 bg-gray-50 rounded-xl">
                <p className="text-gray-400">No sentiment data available</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold mb-2 text-center text-gray-800">
                {title || 'Brand Sentiment Analysis'}
            </h3>
            <p className="text-center text-gray-500 mb-6">
                {subtitle || `Based on ${total} analyzed items`}
            </p>

            {/* Chart Container - Fixed height prevents width/height warning */}
            <div className="w-full h-80 min-h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={110}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            strokeWidth={2}
                            stroke="#fff"
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[entry.name as SentimentKey] || '#8884d8'}
                                    className="hover:opacity-80 transition-opacity cursor-pointer"
                                />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend content={<CustomLegend data={data} />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mt-6">
                {data.map((item) => {
                    const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
                    const color = COLORS[item.name as SentimentKey] || '#8884d8';
                    return (
                        <div
                            key={item.name}
                            className="p-4 rounded-xl border-2 transition-all hover:shadow-md"
                            style={{ borderColor: color, backgroundColor: `${color}10` }}
                        >
                            <p className="text-sm font-medium text-gray-600">{item.name}</p>
                            <p className="text-2xl font-bold" style={{ color }}>{item.value}</p>
                            <p className="text-xs text-gray-500">{percentage}% of total</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SentimentChart;