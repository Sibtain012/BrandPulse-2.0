import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const authHeaders = () => ({
  headers: { "x-auth-token": localStorage.getItem("accessToken") },
});

// Fetches keyword co-occurrence tokens for an analysis. detect() (re)runs the
// Python PMI computation server-side, then refreshes the list.
export const useCooccurrence = (
  requestId,
  { keyword = "", minFreq = 5, sortBy = "pmi", limit = 20 } = {},
) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState(null);

  const fetchTokens = useCallback(async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        minFreq: String(minFreq),
        sortBy,
        limit: String(limit),
      });
      if (keyword) params.set("keyword", keyword);
      const { data } = await axios.get(
        `/api/cooccurrence/analysis/${requestId}/cooccurrence?${params.toString()}`,
        authHeaders(),
      );
      setTokens(data.tokens || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [requestId, keyword, minFreq, sortBy, limit]);

  // Trigger server-side PMI computation (POST), then refresh.
  const detect = useCallback(async () => {
    if (!requestId) return;
    try {
      setComputing(true);
      const params = keyword ? `?keyword=${encodeURIComponent(keyword)}` : "";
      await axios.post(
        `/api/cooccurrence/analysis/${requestId}/cooccurrence/analyze${params}`,
        {},
        authHeaders(),
      );
      await fetchTokens();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setComputing(false);
    }
  }, [requestId, keyword, fetchTokens]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  return { tokens, loading, computing, error, detect, refresh: fetchTokens };
};
