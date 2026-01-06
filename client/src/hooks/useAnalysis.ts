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
        startDate?: string | null,
        endDate?: string | null
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
                    end_date: endDate
                })
            });

            if (!response.ok) throw new Error('Server crash');

            const data = await response.json();

            // CAPTURE: Store the requestId for polling
            if (data.requestId) {
                setActiveRequestId(data.requestId);
            }

            // Handle cached results (duplicate keyword + dates)
            if (data.cached) {
                console.log('📦 Using cached results for this keyword and date range');
                setStatus('COMPLETED'); // Immediately mark as complete
                return data; // Return the data so caller can fetch results
            }

            if (data.trigger === false) setStatus('COMPLETED');

            return data;
        } catch (err) {
            console.error("Analysis failed to start:", err);
            setStatus('FAILED');
        }
    };

    useEffect(() => {
        let interval: any;
        // Poll only if we have an active requestId
        if (status === 'PROCESSING' && activeRequestId) {
            interval = setInterval(async () => {
                try {
                    // FIX: Use relative URL to leverage Vite proxy (avoids CORS & port issues)
                    // Route path matches backend: /api/pipeline/status/id/:requestId
                    const res = await fetch(`/api/pipeline/status/id/${activeRequestId}`);
                    const data = await res.json();

                    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                        setStatus(data.status);
                        clearInterval(interval);
                    }
                } catch (e) {
                    setStatus('FAILED');
                    clearInterval(interval);
                }
            }, 3000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status, activeRequestId]); // Depend on activeRequestId

    // Return the requestId so the component can use it for the Gold Layer fetch
    return { status, startAnalysis, activeRequestId };
};