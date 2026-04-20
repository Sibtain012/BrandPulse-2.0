import { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const GRANULARITIES = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

// Colors match SentimentChart.jsx COLORS object and tailwind.config.js accent values
const LINE_COLORS = {
  Positive: "#10B981",
  Neutral: "#6B7280",
  Negative: "#EF4444",
};

const TrendChart = ({ requestId, platform }) => {
  const [data, setData] = useState([]);
  const [granularity, setGran] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requestId) return;

    setLoading(true);
    setError("");

    axios
      .get(`/api/data/trend/${requestId}?granularity=${granularity}`, {
        headers: { "x-auth-token": localStorage.getItem("accessToken") },
      })
      .then((r) => {
        setData(r.data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load trend data.");
        setLoading(false);
      });
  }, [requestId, granularity]);

  if (!requestId) {
    return (
      <div className="text-center py-12 text-light-400 text-sm">
        Run an analysis first to see sentiment trends.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-accent-red-light/10 text-accent-red-dark rounded-lg border border-accent-red-light/30 text-sm">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-light-400 text-sm">
        No trend data available for this analysis.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-light-600">Group by:</span>
        <div className="flex border border-light-200 rounded-lg overflow-hidden">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              onClick={() => setGran(g.key)}
              className={`px-4 py-1.5 text-sm transition-colors border-r border-light-200 last:border-r-0 ${
                granularity === g.key
                  ? "bg-brand-600 text-white"
                  : "bg-white text-light-600 hover:bg-light-50"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <p className="text-sm font-medium text-light-700 mb-4">
          Sentiment over time —{" "}
          {platform === "twitter" ? "🐦 Twitter" : "🟠 Reddit"}
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelFormatter={(d) => `Date: ${d}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {Object.entries(LINE_COLORS).map(([label, color]) => (
              <Line
                key={label}
                type="monotone"
                dataKey={label}
                stroke={color}
                strokeWidth={2}
                dot={data.length > 20 ? false : { r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
