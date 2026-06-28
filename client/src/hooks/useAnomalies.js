import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const authHeaders = () => ({
  headers: { "x-auth-token": localStorage.getItem("accessToken") },
});

// Fetches detected anomalies for an analysis (by requestId). Also exposes
// detect() to (re)run server-side z-score detection, then refreshes the list.
export const useAnomalies = (requestId, threshold = 2.0) => {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnomalies = useCallback(async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      const { data } = await axios.get(
        `/api/anomaly/analysis/${requestId}/anomalies?threshold=${threshold}`,
        authHeaders(),
      );
      setAnomalies(data.anomalies || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }, [requestId, threshold]);

  // Trigger server-side detection (POST), then refresh the list.
  const detect = useCallback(async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      await axios.post(
        `/api/anomaly/analysis/${requestId}/anomalies/detect?threshold=${threshold}`,
        {},
        authHeaders(),
      );
      await fetchAnomalies();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setLoading(false);
    }
  }, [requestId, threshold, fetchAnomalies]);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  return { anomalies, loading, error, detect, refresh: fetchAnomalies };
};
