import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useCooccurrence } from "../hooks/useCooccurrence";

// Map a PMI score to a plain-language relevance bucket.
const relevanceLabel = (pmi) => {
  if (pmi >= 2.0) return "Very high";
  if (pmi >= 1.5) return "High";
  if (pmi >= 1.0) return "Medium";
  return "Low";
};

const relevanceColor = (pmi) => {
  if (pmi >= 2.0) return "bg-indigo-100 text-indigo-700";
  if (pmi >= 1.5) return "bg-blue-100 text-blue-700";
  if (pmi >= 1.0) return "bg-sky-100 text-sky-700";
  return "bg-light-100 text-light-600";
};

// "Related words" — words that appear most alongside the analysis keyword.
// Stats (PMI) are presented as plain relevance levels; raw PMI is kept in
// tooltips/titles for advanced users.
const CooccurrenceChart = ({ requestId, keyword = "" }) => {
  const [minFreq, setMinFreq] = useState(5);
  const [sortBy, setSortBy] = useState("pmi");

  const { tokens, loading, computing, error, detect } = useCooccurrence(
    requestId,
    { keyword, minFreq, sortBy, limit: 15 },
  );

  if (!requestId) return null;

  const byRelevance = sortBy === "pmi";

  const chartData = tokens
    .map((t) => ({
      token: t.cooccur_token,
      value: byRelevance ? Number(t.pmi_score) : t.count,
      count: t.count,
      pmi: Number(t.pmi_score),
    }))
    .reverse(); // recharts horizontal: first item at bottom -> reverse for top-ranked on top

  const barColor = byRelevance ? "#6366F1" : "#0EA5E9";

  return (
    <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="text-base font-semibold text-light-800">
            Related Words{" "}
            {keyword && <span className="text-light-400">— “{keyword}”</span>}
          </p>
          <p className="text-sm text-light-500 mt-0.5">
            Words people mention most alongside your keyword. Useful to see what
            topics come up with your brand.
          </p>
        </div>
        <button
          onClick={detect}
          disabled={computing}
          className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {computing ? "Analyzing…" : "Find related words"}
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <span className="text-light-600">Show:</span>
          <div className="flex border border-light-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setSortBy("pmi")}
              className={`px-3 py-1 transition-colors ${
                byRelevance
                  ? "bg-brand-600 text-white"
                  : "bg-white text-light-600 hover:bg-light-50"
              }`}
            >
              Most related
            </button>
            <button
              onClick={() => setSortBy("count")}
              className={`px-3 py-1 transition-colors ${
                !byRelevance
                  ? "bg-brand-600 text-white"
                  : "bg-white text-light-600 hover:bg-light-50"
              }`}
            >
              Most mentioned
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-light-600">
          Ignore rare words:{" "}
          <span className="font-medium text-light-800">{minFreq}+ times</span>
          <input
            type="range"
            min="1"
            max="30"
            value={minFreq}
            onChange={(e) => setMinFreq(parseInt(e.target.value, 10))}
            className="accent-brand-600"
          />
        </label>
      </div>

      {error && (
        <div className="p-3 bg-accent-red-light/10 text-accent-red-dark rounded-lg border border-accent-red-light/30 text-sm">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600" />
        </div>
      )}

      {!error && !loading && chartData.length === 0 && (
        <p className="text-sm text-light-400 py-6 text-center">
          No related words yet. Click “Find related words” to analyze, or lower
          the “ignore rare words” slider.
        </p>
      )}

      {!loading && chartData.length > 0 && (
        <>
          <p className="text-xs text-light-500">
            {byRelevance
              ? "Longer bar = more uniquely tied to your keyword (not just a common word)."
              : "Longer bar = mentioned more often alongside your keyword."}
          </p>
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, chartData.length * 28)}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="token"
                tick={{ fontSize: 11 }}
                width={90}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(val, _n, p) => [
                  byRelevance
                    ? `${relevanceLabel(p.payload.pmi)} relevance · mentioned ${p.payload.count}×`
                    : `Mentioned ${val}× · ${relevanceLabel(p.payload.pmi)} relevance`,
                  p.payload.token,
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={barColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Data table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-light-500 border-b">
                  <th className="py-1.5 pr-4 font-medium">Word</th>
                  <th className="py-1.5 pr-4 font-medium">Times mentioned</th>
                  <th className="py-1.5 font-medium">Relevance</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const pmi = Number(t.pmi_score);
                  return (
                    <tr
                      key={t.cooccurrence_id}
                      className="border-b border-light-100"
                    >
                      <td className="py-1.5 pr-4 text-light-700">
                        {t.cooccur_token}
                      </td>
                      <td className="py-1.5 pr-4 text-light-600">{t.count}</td>
                      <td className="py-1.5">
                        <span
                          title={`PMI ${pmi.toFixed(2)}`}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${relevanceColor(
                            pmi,
                          )}`}
                        >
                          {relevanceLabel(pmi)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default CooccurrenceChart;
