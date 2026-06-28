import { useAnomalies } from "../hooks/useAnomalies";

// Formats an ISO date string to a friendly "Jun 7, 2026".
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

// Turn a z-score magnitude into a plain severity word.
const severity = (absZ) => (absZ > 3 ? "Major" : "Notable");

// Build a plain-English description of an anomaly row.
const describe = (a) => {
  const z = Number(a.z_score);
  const observed = a.observed_count;
  const base = Number(a.baseline_mean);
  const spike = z > 0;
  const dir = spike ? "more" : "fewer";
  // "about 4× the usual" — only meaningful when baseline is a real number.
  let comparison;
  if (base >= 1) {
    const ratio = observed / base;
    comparison =
      ratio >= 2 || ratio <= 0.5
        ? `about ${ratio >= 1 ? ratio.toFixed(1) : (1 / ratio).toFixed(1)}× ${
            spike ? "more than" : "fewer than"
          } usual`
        : `${dir} than usual`;
  } else {
    comparison = spike ? "far more than usual" : "far fewer than usual";
  }
  return {
    spike,
    headline: `${observed} ${a.sentiment_label} posts`,
    detail: `${comparison} (normally about ${Math.round(base)} per day)`,
  };
};

// Lists days when post volume was unusually high or low vs the trailing
// 7-day baseline. Stats (z-score) are translated to plain language; the raw
// z-score is preserved in the row's hover tooltip for advanced users.
const AnomalyOverlay = ({ requestId, threshold = 2.0 }) => {
  const { anomalies, loading, error, detect } = useAnomalies(
    requestId,
    threshold,
  );

  if (!requestId) return null;

  return (
    <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-light-800">
            Unusual Activity
          </p>
          <p className="text-sm text-light-500 mt-0.5">
            Days when the number of posts was much higher or lower than normal.
          </p>
        </div>
        <button
          onClick={detect}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "Scanning…" : "Scan for unusual days"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-accent-red-light/10 text-accent-red-dark rounded-lg border border-accent-red-light/30 text-sm">
          {error}
        </div>
      )}

      {!error && !loading && anomalies.length === 0 && (
        <p className="text-sm text-light-400 py-4 text-center">
          No unusual days found yet. Click “Scan for unusual days” to check this
          analysis.
        </p>
      )}

      {anomalies.length > 0 && (
        <div className="divide-y divide-light-100">
          {anomalies.map((a) => {
            const z = Number(a.z_score);
            const absZ = Math.abs(z);
            const { spike, headline, detail } = describe(a);
            return (
              <div
                key={a.anomaly_id}
                className="flex items-center gap-3 py-3"
                title={`z-score ${z.toFixed(2)} (baseline ${Number(
                  a.baseline_mean,
                ).toFixed(1)})`}
              >
                <span
                  className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-semibold border ${
                    spike
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {spike ? "▲ Spike" : "▼ Drop"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-800">
                    {headline}
                  </p>
                  <p className="text-xs text-light-500">{detail}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-light-500">{fmtDate(a.event_date)}</p>
                  <p
                    className={`text-xs font-semibold ${
                      absZ > 3 ? "text-accent-red-dark" : "text-amber-600"
                    }`}
                  >
                    {severity(absZ)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {anomalies.length > 0 && (
        <p className="text-xs text-light-400 pt-1 border-t">
          “Major” = an extreme change, “Notable” = a clear change. Based on how
          far each day differs from the previous 7-day average.
        </p>
      )}
    </div>
  );
};

export default AnomalyOverlay;
