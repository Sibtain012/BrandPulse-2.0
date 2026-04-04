import { useState, useEffect } from 'react';

export const useAnalysis = () => {
    // Initialize status based on whether we have a stored request ID
    const [status, setStatus] = useState(() => {
        return localStorage.getItem('activeRequestId') ? 'PROCESSING' : 'IDLE';
    });

    // Initialize activeRequestId from localStorage if available
    const [activeRequestId, setActiveRequestId] = useState(() => {
        const stored = localStorage.getItem('activeRequestId');
        return stored ? parseInt(stored) : null;
    });

    // Updated to accept userId and optional date parameters
    const startAnalysis = async (
        keyword,
        userId,
        startDate = null,
        endDate = null,
        platform = 'reddit'
    ) => {
        setStatus('PROCESSING');
        try {
            const response = await fetch('/api/pipeline/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send user_id and optional date filters
                body: JSON.stringify({
                    keyword,
                    user_id: userId,
                    start_date: startDate,
                    end_date: endDate,
                    platform
                })
            });

            if (!response.ok) throw new Error('Server crash');

            const data = await response.json();

            // Store the requestId for polling
            if (data.requestId) {
                setActiveRequestId(data.requestId);
                localStorage.setItem('activeRequestId', data.requestId.toString());
            }

            // Handle cached results (≥75% coverage threshold)
            if (data.cached) {
                console.log(`📦 Using cached results (${data.cacheInfo?.coverage?.toFixed(1)}% coverage)`);
                setStatus('COMPLETED'); // Immediately mark as complete
                // If cached, we don't need to persist or poll
                localStorage.removeItem('activeRequestId');
                setActiveRequestId(null);
                return data; // Return the data so caller can fetch results
            }

            return data;
        } catch (err) {
            console.error("Analysis failed to start:", err);
            setStatus('FAILED');
            localStorage.removeItem('activeRequestId');
        }
    };

    useEffect(() => {
        let interval;
        let failCount = 0;
        const MAX_FAILS = 5; // Allow up to 5 failed polls before giving up

        // Poll only if we have an active requestId
        if (status === 'PROCESSING' && activeRequestId) {
            interval = setInterval(async () => {
                try {
                    // FIX: Use relative URL to leverage Vite proxy (avoids CORS & port issues)
                    // Route path matches backend: /api/pipeline/status/id/:requestId
                    const res = await fetch(`/api/pipeline/status/id/${activeRequestId}`);

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const data = await res.json();

                    // Reset fail count on successful poll
                    failCount = 0;

                    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                        setStatus(data.status);
                        // Clear persistence once terminal state is reached
                        localStorage.removeItem('activeRequestId');
                        clearInterval(interval);
                    }
                } catch (e) {
                    failCount++;
                    console.warn(`⚠️ Status poll failed (${failCount}/${MAX_FAILS}):`, e);

                    // Only mark as failed after multiple consecutive failures
                    if (failCount >= MAX_FAILS) {
                        console.error('❌ Too many failed status polls, marking as FAILED');
                        setStatus('FAILED');
                        localStorage.removeItem('activeRequestId');
                        clearInterval(interval);
                    }
                }
            }, 3000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status, activeRequestId]); // Depend on activeRequestId

    // Return the requestId so the component can use it for the Gold Layer fetch
    return { status, startAnalysis, activeRequestId };
};
