import { useState, useEffect } from 'react';
import type { AnalysisStatus } from '../utils/api';

export const useAnalysis = () => {
    const [status, setStatus] = useState<AnalysisStatus>('IDLE');
    // Track the unique ID returned by the server instead of just the keyword string
    const [activeRequestId, setActiveRequestId] = useState<number | null>(null);

    // Updated to accept userId and optional date parameters
    const startAnalysis = async (
        keyword: string,
        userId: number,
        startDate: string | null = null,
        endDate: string | null = null,
        platform: 'reddit' | 'twitter' = 'reddit'
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
            }

            return data;
        } catch (err) {
            console.error("Analysis failed to start:", err);
            setStatus('FAILED');
        }
    };

    useEffect(() => {
        let interval: any;
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
                        clearInterval(interval);
                    }
                } catch (e) {
                    failCount++;
                    console.warn(`⚠️ Status poll failed (${failCount}/${MAX_FAILS}):`, e);

                    // Only mark as failed after multiple consecutive failures
                    if (failCount >= MAX_FAILS) {
                        console.error('❌ Too many failed status polls, marking as FAILED');
                        setStatus('FAILED');
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