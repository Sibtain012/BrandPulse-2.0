import { useState, useEffect } from 'react';

export const useAnalysis = () => {
    const [status, setStatus] = useState(() => {
        return localStorage.getItem('activeRequestId') ? 'PROCESSING' : 'IDLE';
    });

    const [activeRequestId, setActiveRequestId] = useState(() => {
        const stored = localStorage.getItem('activeRequestId');
        return stored ? parseInt(stored) : null;
    });

    const [activeMode, setActiveMode] = useState(() => {
        return localStorage.getItem('activeAnalysisMode') || 'sentiment';
    });

    const startAnalysis = async (
        keyword,
        userId,
        startDate = null,
        endDate = null,
        platform = 'reddit',
        analysisMode = 'sentiment'
    ) => {
        setStatus('PROCESSING');
        setActiveMode(analysisMode);
        try {
            const response = await fetch('/api/pipeline/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword,
                    user_id: userId,
                    start_date: startDate,
                    end_date: endDate,
                    platform,
                    analysis_mode: analysisMode
                })
            });

            if (!response.ok) throw new Error('Server crash');

            const data = await response.json();

            if (data.requestId) {
                setActiveRequestId(data.requestId);
                localStorage.setItem('activeRequestId', data.requestId.toString());
                localStorage.setItem('activeAnalysisMode', analysisMode);
            }

            if (data.cached) {
                setStatus('COMPLETED');
                localStorage.removeItem('activeRequestId');
                localStorage.removeItem('activeAnalysisMode');
                setActiveRequestId(null);
                return data;
            }

            return data;
        } catch (err) {
            setStatus('FAILED');
            localStorage.removeItem('activeRequestId');
            localStorage.removeItem('activeAnalysisMode');
        }
    };

    useEffect(() => {
        let interval;
        let failCount = 0;
        const MAX_FAILS = 5;

        if (status === 'PROCESSING' && activeRequestId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/pipeline/status/id/${activeRequestId}`);

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const data = await res.json();

                    failCount = 0;

                    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
                        setStatus(data.status);
                        localStorage.removeItem('activeRequestId');
                        localStorage.removeItem('activeAnalysisMode');
                        clearInterval(interval);
                    }
                } catch (e) {
                    failCount++;

                    if (failCount >= MAX_FAILS) {
                        setStatus('FAILED');
                        localStorage.removeItem('activeRequestId');
                        localStorage.removeItem('activeAnalysisMode');
                        clearInterval(interval);
                    }
                }
            }, 3000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status, activeRequestId]);

    return { status, startAnalysis, activeRequestId, activeMode };
};
