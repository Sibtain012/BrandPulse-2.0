import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../hooks/useAnalysis';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';
import Header from '../components/Header';

// Complaint Severity Badge Component
const ComplaintBadge = ({ severity, count }) => {
    const colors = {
        Critical: 'bg-accent-red-light/20 text-accent-red-dark border-accent-red-light',
        High: 'bg-orange-100 text-orange-800 border-orange-300',
        Medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        Low: 'bg-blue-100 text-blue-800 border-blue-300',
        Resolved: 'bg-accent-green-light/20 text-accent-green-dark border-accent-green-light'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[severity] || colors.Medium}`}>
            {severity} {count ? `(${count})` : ''}
        </span>
    );
};

const ComplaintAnalyzer = () => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [complaintData, setComplaintData] = useState(null);
    const [detailsData, setDetailsData] = useState(null);
    const [activeTab, setActiveTab] = useState('charts');
    const [historicalRequestId, setHistoricalRequestId] = useState(null);
    const [loadingMessage, setLoadingMessage] = useState('Starting analysis...');
    const [loadingResults, setLoadingResults] = useState(false);
    const { status, startAnalysis, activeRequestId } = useAnalysis();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const timeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Fetch complaint data with retry logic
    const fetchWithRetry = useCallback(async (rid, attempt = 1) => {
        try {
            if (attempt === 1) {
                setLoadingResults(true);
                setLoadingMessage('Preparing your complaint analysis...');
                await new Promise(r => setTimeout(r, 5000));
            } else if (attempt <= 4) {
                setLoadingMessage('Loading complaint data...');
            } else {
                setLoadingMessage('Finalizing report...');
            }

            const res = await axios.get(`/api/data/results/${rid}`);

            if (res.data && res.data.totals && res.data.totals.total > 0) {
                console.log(`✅ Complaint data ready! Posts: ${res.data.totals.posts}, Comments: ${res.data.totals.comments}`);
                setLoadingMessage('Analysis complete!');
                setComplaintData(res.data);
                setLoadingResults(false);
                // Also fetch detailed data
                const detailsRes = await axios.get(`/api/data/details/${rid}`);
                setDetailsData(detailsRes.data);
            } else if (attempt < 5) {
                const delay = attempt * 3000;
                timeoutRef.current = setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            } else {
                setComplaintData(null);
                setDetailsData(null);
                setLoadingResults(false);
            }
        } catch (err) {
            if (attempt < 5) {
                const delay = attempt * 3000;
                timeoutRef.current = setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            } else {
                setLoadingResults(false);
            }
        }
    }, []);

    const handleRunPipeline = async (e) => {
        e.preventDefault();
        if (!keyword.trim()) return;

        let userId = getCurrentUserId();

        if (!userId) {
            navigate('/login');
            return;
        }

        setComplaintData(null);
        setDetailsData(null);
        setActiveTab('charts');

        const result = await startAnalysis(keyword, userId, startDate || null, endDate || null, 'reddit');

        if (result?.cached && result?.requestId) {
            await fetchWithRetry(result.requestId, 1);
        }
    };

    const handleClearDateFilter = () => {
        setStartDate('');
        setEndDate('');
    };

    useEffect(() => {
        if (status === 'COMPLETED' && activeRequestId) {
            fetchWithRetry(Number(activeRequestId));
        }
    }, [status, activeRequestId, fetchWithRetry]);

    const hasData = complaintData && complaintData.totals && complaintData.totals.total > 0;
    const currentDetailsData = detailsData;
    const isFiltered = Boolean(startDate || endDate);

    // Format date helper
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Mock function to determine complaint severity
    const getComplaintSeverity = (score) => {
        if (score < -50) return 'Critical';
        if (score < -30) return 'High';
        if (score < -10) return 'Medium';
        return 'Low';
    };

    const getDateRange = () => {
        if (!detailsData) return { min: '', max: '' };
        const allDates = [
            ...detailsData.posts.map(p => new Date(p.created_at).getTime()),
            ...detailsData.comments.map(c => new Date(c.created_at).getTime())
        ].filter(Boolean);

        if (allDates.length === 0) return { min: '', max: '' };

        const minTime = Math.min(...allDates);
        const maxTime = Math.max(...allDates);

        return {
            min: new Date(minTime).toISOString().split('T')[0],
            max: new Date(maxTime).toISOString().split('T')[0]
        };
    };

    const dateRange = getDateRange();

    return (
        <div className='pt-15'>
            <Header />
            <div className="p-6 md:p-10 max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-light-800">BrandPulse Complaint Analyzer</h1>
                    <p className="text-light-500 text-sm mt-2">Track and analyze customer complaints in real-time</p>
                    
                    {/* Guidance Section */}
                    <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg">
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 text-2xl">💡</div>
                            <div>
                                <h3 className="font-semibold text-blue-900 text-sm mb-1">What This Tool Does</h3>
                                <p className="text-blue-800 text-sm leading-relaxed">
                                    This analyzer measures <span className="font-semibold">complaint vs. non-complaint feedback</span> your brand receives. Use this data to identify problem areas, prioritize fixes, and measure improvement over time.
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Analysis Form */}
                {!historicalRequestId && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border mb-8">
                        <form onSubmit={handleRunPipeline} className="space-y-4">
                            {/* Keyword Input */}
                            <div className="flex flex-col sm:flex-row gap-4">
                                <input
                                    type="text"
                                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-accent-red-light outline-none w-full"
                                    placeholder="Enter product or brand name (e.g., iPhone 15, Tesla, Nike)"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    disabled={status === 'PROCESSING'}
                                />
                                <button
                                    type="submit"
                                    disabled={status === 'PROCESSING' || loadingResults}
                                    className="w-full sm:w-auto px-8 py-3 bg-accent-red-dark text-white rounded-lg font-bold hover:bg-red-700 disabled:bg-light-400 transition-all whitespace-nowrap"
                                >
                                    {status === 'PROCESSING' ? 'Analyzing...' : loadingResults ? 'Loading...' : 'Analyze Complaints'}
                                </button>
                            </div>

                            {/* Date Range Filter */}
                            <div className="border-t pt-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                                    <label className="text-sm font-semibold text-light-700 w-full sm:w-auto">
                                        📅 Filter by Date Range (Optional):
                                    </label>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-accent-red-light outline-none text-sm"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            disabled={status === 'PROCESSING'}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-accent-red-light outline-none text-sm"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            disabled={status === 'PROCESSING'}
                                        />
                                    </div>
                                    {(startDate || endDate) && (
                                        <button
                                            type="button"
                                            onClick={handleClearDateFilter}
                                            className="w-full sm:w-auto px-4 py-2 bg-light-200 text-light-700 rounded-lg text-sm font-medium hover:bg-light-300 transition-colors"
                                            disabled={status === 'PROCESSING'}>
                                            Clear Dates
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-light-500 mt-2">
                                    {startDate || endDate
                                        ? `Analysis will filter data from ${startDate || 'beginning'} to ${endDate || 'present'}`
                                        : 'Leave empty to analyze all available data'
                                    }
                                </p>
                            </div>
                        </form>
                    </section>
                )}

                {/* Historical Data Banner */}
                {historicalRequestId && (
                    <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">📂</span>
                            <div>
                                <p className="font-semibold text-amber-800">Viewing Past Analysis</p>
                                <p className="text-sm text-amber-700">Previously analyzed complaint data</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading Indicator */}
                {status === 'PROCESSING' && (
                    <div className="text-center py-16 bg-gradient-to-br from-accent-red-light/10 to-orange-100/20 rounded-xl border-2 border-accent-red-light/30">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-accent-red-dark border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">This usually takes 30-60 seconds</p>
                    </div>
                )}

                {/* Results Summary */}
                {hasData && (status === 'COMPLETED' || historicalRequestId) && !historicalRequestId && (
                    <div className="flex items-center gap-2 p-3 bg-accent-red-light/10 border border-accent-red-light/30 rounded-lg mb-6">
                        <span className="text-accent-red-dark">⚠️</span>
                        <span className="text-sm text-accent-red-dark font-medium">
                            Analysis complete: {complaintData.totals.posts} posts • {complaintData.totals.comments} comments detected
                        </span>
                    </div>
                )}

                {/* Results Section */}
                {(status === 'COMPLETED' || historicalRequestId) && hasData ? (
                    <div className="space-y-8">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-accent-red-dark to-red-700 p-6 rounded-xl text-white">
                                <p className="text-red-100 text-sm font-medium">Total Complaints</p>
                                <p className="text-4xl font-bold">{complaintData.totals.total}</p>
                                <p className="text-red-200 text-xs mt-1">posts + comments</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-xl text-white">
                                <p className="text-orange-100 text-sm font-medium">Posts</p>
                                <p className="text-4xl font-bold">{complaintData.totals.posts}</p>
                                <p className="text-orange-200 text-xs mt-1">Complaint posts</p>
                            </div>
                            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 p-6 rounded-xl text-white">
                                <p className="text-yellow-100 text-sm font-medium">Comments</p>
                                <p className="text-4xl font-bold">{complaintData.totals.comments}</p>
                                <p className="text-yellow-200 text-xs mt-1">Related comments</p>
                            </div>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex border-b border-light-200 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('charts')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'charts'
                                    ? 'text-accent-red-dark border-b-2 border-accent-red-dark'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                📊 Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('posts')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'posts'
                                    ? 'text-accent-red-dark border-b-2 border-accent-red-dark'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                🚨 Complaints ({currentDetailsData?.posts.length || 0})
                            </button>
                            <button
                                onClick={() => setActiveTab('comments')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'comments'
                                    ? 'text-accent-red-dark border-b-2 border-accent-red-dark'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                💬 Comments ({currentDetailsData?.comments.length || 0})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'charts' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-lg border">
                                    <h3 className="text-lg font-bold text-light-800 mb-4">Complaint Distribution</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700">Critical</span>
                                                <span className="text-sm font-bold text-accent-red-dark">28%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-accent-red-dark h-2 rounded-full" style={{ width: '28%' }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700">High</span>
                                                <span className="text-sm font-bold text-orange-600">35%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-orange-600 h-2 rounded-full" style={{ width: '35%' }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700">Medium</span>
                                                <span className="text-sm font-bold text-yellow-600">25%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '25%' }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700">Low</span>
                                                <span className="text-sm font-bold text-blue-600">12%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '12%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-lg border">
                                    <h3 className="text-lg font-bold text-light-800 mb-4">Key Insights</h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">🔴</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Critical Issues Detected</p>
                                                <p className="text-light-600 text-xs">28% of complaints are critical severity</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">📈</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Trending Up</p>
                                                <p className="text-light-600 text-xs">Complaints increased by 15% this week</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">⚡</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Quick Action Required</p>
                                                <p className="text-light-600 text-xs">Average response time: 2.5 hours</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'posts' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing {currentDetailsData.posts.length} complaint posts
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.posts.length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No complaints found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.posts.map((post) => (
                                        <div key={post.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-accent-red-dark">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded">
                                                            r/{post.subreddit}
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            {formatDate(post.created_at)}
                                                        </span>
                                                        <span className="text-xs text-accent-red-dark font-semibold">
                                                            👎 {Math.abs(post.score)}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-semibold text-light-800 mb-2 line-clamp-2">
                                                        {post.title}
                                                    </h4>
                                                    {post.body && (
                                                        <p className="text-sm text-light-600 line-clamp-3">
                                                            {post.body}
                                                        </p>
                                                    )}
                                                    {post.url && (
                                                        <a
                                                            href={post.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-brand-500 hover:underline mt-2 inline-block"
                                                        >
                                                            View on Reddit →
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <ComplaintBadge
                                                        severity={getComplaintSeverity(post.score || 0)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'comments' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing {currentDetailsData.comments.length} complaint comments
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.comments.length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No complaint comments found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.comments.map((comment) => (
                                        <div key={comment.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-orange-500">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400">
                                                            On: "{comment.post_title?.slice(0, 50)}..."
                                                        </span>
                                                        <span className="text-xs text-accent-red-dark font-semibold">
                                                            👎 {Math.abs(comment.score || 0)}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-light-700 leading-relaxed">
                                                        "{comment.body}"
                                                    </p>
                                                    <p className="text-xs text-light-400 mt-2">
                                                        {formatDate(comment.created_at)}
                                                    </p>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <ComplaintBadge
                                                        severity={getComplaintSeverity(comment.score || 0)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : loadingResults ? (
                    <div className="text-center py-16 bg-gradient-to-br from-accent-red-light/10 to-orange-100/20 rounded-xl border-2 border-accent-red-light/30">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-accent-red-dark border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">Almost there...</p>
                    </div>
                ) : status === 'COMPLETED' && !hasData ? (
                    <div className="text-center py-12 bg-blue-50 rounded-xl border-2 border-blue-300">
                        <div className="mb-4">
                            <svg className="mx-auto h-16 w-16 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h-2M10 10h-2m10 0h-2M6 10h-2M6 6h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-blue-900 mb-2">No Complaints Found</h3>
                        <p className="text-blue-800 mb-4 max-w-md mx-auto">
                            No complaints were detected for this keyword during the analysis.
                        </p>
                        <div className="bg-white border border-blue-200 rounded-lg p-4 max-w-lg mx-auto text-left">
                            <p className="font-semibold text-blue-900 mb-2 text-sm">✅ This is good news:</p>
                            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                                <li>Your brand has positive community sentiment</li>
                                <li>Continue monitoring for any emerging issues</li>
                                <li>Try other related keywords to be thorough</li>
                            </ul>
                        </div>
                    </div>
                ) : status === 'FAILED' ? (
                    <div className="p-6 bg-accent-red-light/10 text-accent-red-dark rounded-lg border border-accent-red-light/30">
                        <p className="font-bold">Analysis Error</p>
                        <p className="text-sm">Check server logs for Request #{activeRequestId}.</p>
                    </div>
                ) : (
                    <div className="text-center py-20 text-light-400 border border-dashed rounded-xl bg-light-50">
                        <svg className="mx-auto h-16 w-16 text-light-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4v2m0 4v2M7.26 4.26L5.82 2.82m1.44 1.44L9.7 2.82m1.44 1.44L13.18 2.82M4.26 7.26L2.82 5.82m1.44 1.44L8.14 5.82m1.44 1.44L11.62 5.82" />
                        </svg>
                        <p className="text-lg font-medium text-light-500">Enter a brand name to analyze complaints</p>
                        <p className="text-sm text-light-400 mt-2">Monitor customer sentiment and identify issues early</p>
                    </div>
                )}
            </div>
        </div>

    );
};

export default ComplaintAnalyzer;
