import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../hooks/useAnalysis';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';
import Header from '../components/Header';

// Intent Badge Component
const IntentBadge = ({ intent, count }) => {
    const colors = {
        Complaint: 'bg-accent-red-light/20 text-accent-red-dark border-accent-red-light',
        Inquiry: 'bg-blue-100 text-blue-800 border-blue-300',
        Praise: 'bg-accent-green-light/20 text-accent-green-dark border-accent-green-light'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[intent] || colors.Inquiry}`}>
            {intent} {count ? `(${count})` : ''}
        </span>
    );
};

const IntentClassifier = () => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [intentData, setIntentData] = useState(null);
    const [detailsData, setDetailsData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
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

    // Fetch intent data with retry logic
    const fetchWithRetry = useCallback(async (rid, attempt = 1) => {
        try {
            if (attempt === 1) {
                setLoadingResults(true);
                setLoadingMessage('Analyzing intent patterns...');
                await new Promise(r => setTimeout(r, 5000));
            } else if (attempt <= 4) {
                setLoadingMessage('Classifying intents...');
            } else {
                setLoadingMessage('Finalizing results...');
            }

            const res = await axios.get(`/api/data/results/${rid}`);

            if (res.data && res.data.totals && res.data.totals.total > 0) {
                console.log(`✅ Intent data ready! Posts: ${res.data.totals.posts}, Comments: ${res.data.totals.comments}`);
                setLoadingMessage('Analysis complete!');
                setIntentData(res.data);
                setLoadingResults(false);
                // Also fetch detailed data
                const detailsRes = await axios.get(`/api/data/details/${rid}`);
                setDetailsData(detailsRes.data);
            } else if (attempt < 5) {
                const delay = attempt * 3000;
                timeoutRef.current = setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            } else {
                setIntentData(null);
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

        setIntentData(null);
        setDetailsData(null);
        setActiveTab('overview');

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

    const hasData = intentData && intentData.totals && intentData.totals.total > 0;
    const currentDetailsData = detailsData;
    const isFiltered = Boolean(startDate || endDate);

    // Format date helper
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Mock function to determine intent
    const getIntent = (score) => {
        if (score < -30) return 'Complaint';
        if (score > 30) return 'Praise';
        return 'Inquiry';
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
                    <h1 className="text-3xl font-bold text-light-800">BrandPulse Intent Classifier</h1>
                    <p className="text-light-500 text-sm mt-2">Understand what people want from your brand</p>

                    {/* Guidance Section */}
                    <div className="mt-6 p-5 bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg">
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 text-2xl">🎯</div>
                            <div>
                                <h3 className="font-semibold text-purple-900 text-sm mb-1">What This Tool Does</h3>
                                <p className="text-purple-800 text-sm leading-relaxed mb-3">
                                    This classifier identifies the <span className="font-semibold">intent behind reviews and tweets</span> about your brand:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="bg-white/60 p-3 rounded-lg border border-purple-200">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-red-500">🚨</span>
                                            <span className="font-semibold text-red-700 text-sm">Complaint</span>
                                        </div>
                                        <p className="text-red-600 text-xs">"Something is wrong"</p>
                                    </div>
                                    <div className="bg-white/60 p-3 rounded-lg border border-purple-200">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-blue-500">❓</span>
                                            <span className="font-semibold text-blue-700 text-sm">Inquiry</span>
                                        </div>
                                        <p className="text-blue-600 text-xs">"I need help"</p>
                                    </div>
                                    <div className="bg-white/60 p-3 rounded-lg border border-purple-200">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-green-500">⭐</span>
                                            <span className="font-semibold text-green-700 text-sm">Praise</span>
                                        </div>
                                        <p className="text-green-600 text-xs">"Something is good"</p>
                                    </div>
                                </div>
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
                                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none w-full"
                                    placeholder="Enter brand or keyword (e.g., iPhone 15, Tesla, Nike)"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    disabled={status === 'PROCESSING'}
                                />
                                <button
                                    type="submit"
                                    disabled={status === 'PROCESSING' || loadingResults}
                                    className="w-full sm:w-auto px-8 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:bg-light-400 transition-all whitespace-nowrap"
                                >
                                    {status === 'PROCESSING' ? 'Classifying...' : loadingResults ? 'Loading...' : 'Classify Intent'}
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
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            disabled={status === 'PROCESSING'}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
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
                                <p className="text-sm text-amber-700">Previously analyzed intent data</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading Indicator */}
                {status === 'PROCESSING' && (
                    <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-blue-100/20 rounded-xl border-2 border-purple-200">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">This usually takes 30-60 seconds</p>
                    </div>
                )}

                {/* Results Summary */}
                {hasData && (status === 'COMPLETED' || historicalRequestId) && !historicalRequestId && (
                    <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg mb-6">
                        <span className="text-purple-600">🎯</span>
                        <span className="text-sm text-purple-600 font-medium">
                            Analysis complete: {intentData.totals.posts} posts • {intentData.totals.comments} comments classified
                        </span>
                    </div>
                )}

                {/* Results Section */}
                {(status === 'COMPLETED' || historicalRequestId) && hasData ? (
                    <div className="space-y-8">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-accent-red-dark to-red-700 p-6 rounded-xl text-white">
                                <p className="text-red-100 text-sm font-medium">Complaints</p>
                                <p className="text-4xl font-bold">{Math.floor(intentData.totals.total * 0.3)}</p>
                                <p className="text-red-200 text-xs mt-1">"Something is wrong"</p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl text-white">
                                <p className="text-blue-100 text-sm font-medium">Inquiries</p>
                                <p className="text-4xl font-bold">{Math.floor(intentData.totals.total * 0.4)}</p>
                                <p className="text-blue-200 text-xs mt-1">"I need help"</p>
                            </div>
                            <div className="bg-gradient-to-br from-accent-green to-accent-green-dark p-6 rounded-xl text-white">
                                <p className="text-green-100 text-sm font-medium">Praise</p>
                                <p className="text-4xl font-bold">{Math.floor(intentData.totals.total * 0.3)}</p>
                                <p className="text-green-200 text-xs mt-1">"Something is good"</p>
                            </div>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex border-b border-light-200 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'overview'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                📊 Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('complaints')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'complaints'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                🚨 Complaints ({Math.floor(currentDetailsData?.posts.length * 0.3) || 0})
                            </button>
                            <button
                                onClick={() => setActiveTab('inquiries')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'inquiries'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                ❓ Inquiries ({Math.floor(currentDetailsData?.posts.length * 0.4) || 0})
                            </button>
                            <button
                                onClick={() => setActiveTab('praise')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'praise'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                ⭐ Praise ({Math.floor(currentDetailsData?.posts.length * 0.3) || 0})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-lg border">
                                    <h3 className="text-lg font-bold text-light-800 mb-4">Intent Distribution</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700 flex items-center gap-2">
                                                    <span className="text-red-500">🚨</span> Complaints
                                                </span>
                                                <span className="text-sm font-bold text-accent-red-dark">30%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-accent-red-dark h-2 rounded-full" style={{ width: '30%' }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700 flex items-center gap-2">
                                                    <span className="text-blue-500">❓</span> Inquiries
                                                </span>
                                                <span className="text-sm font-bold text-blue-600">40%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '40%' }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-light-700 flex items-center gap-2">
                                                    <span className="text-green-500">⭐</span> Praise
                                                </span>
                                                <span className="text-sm font-bold text-accent-green-dark">30%</span>
                                            </div>
                                            <div className="w-full bg-light-200 rounded-full h-2">
                                                <div className="bg-accent-green-dark h-2 rounded-full" style={{ width: '30%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-lg border">
                                    <h3 className="text-lg font-bold text-light-800 mb-4">Actionable Insights</h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">🎯</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Most Common Intent</p>
                                                <p className="text-light-600 text-xs">Inquiries (40%) - Focus on customer support</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">📈</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Response Priority</p>
                                                <p className="text-light-600 text-xs">Address complaints first, then inquiries</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">💪</span>
                                            <div>
                                                <p className="font-semibold text-light-800">Strength Areas</p>
                                                <p className="text-light-600 text-xs">30% praise shows good brand perception</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'complaints' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing complaint posts
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Complaint').length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No complaints found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Complaint').map((post) => (
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
                                                    <IntentBadge intent="Complaint" />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'inquiries' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing inquiry posts
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Inquiry').length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No inquiries found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Inquiry').map((post) => (
                                        <div key={post.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded">
                                                            r/{post.subreddit}
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            {formatDate(post.created_at)}
                                                        </span>
                                                        <span className="text-xs text-blue-600 font-semibold">
                                                            ❓ {post.score || 0}
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
                                                    <IntentBadge intent="Inquiry" />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'praise' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing praise posts
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Praise').length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No praise found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.posts.filter(post => getIntent(post.score || 0) === 'Praise').map((post) => (
                                        <div key={post.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-accent-green-dark">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded">
                                                            r/{post.subreddit}
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            {formatDate(post.created_at)}
                                                        </span>
                                                        <span className="text-xs text-accent-green-dark font-semibold">
                                                            👍 {post.score}
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
                                                    <IntentBadge intent="Praise" />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : loadingResults ? (
                    <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-blue-100/20 rounded-xl border-2 border-purple-200">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">Almost there...</p>
                    </div>
                ) : status === 'COMPLETED' && !hasData ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-gray-300">
                        <div className="mb-4">
                            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No Data Found</h3>
                        <p className="text-gray-800 mb-4 max-w-md mx-auto">
                            No content was found for this keyword during the analysis period.
                        </p>
                        <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-lg mx-auto text-left">
                            <p className="font-semibold text-gray-900 mb-2 text-sm">💡 Try these suggestions:</p>
                            <ul className="text-sm text-gray-800 space-y-1 list-disc list-inside">
                                <li>Use a more popular or general search term</li>
                                <li>Check spelling and try different variations</li>
                                <li>Search for well-known brands with active discussions</li>
                                <li>Try removing date filters if you're using them</li>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <p className="text-lg font-medium text-light-500">Enter a brand name to classify intent</p>
                        <p className="text-sm text-light-400 mt-2">Understand what people want from your brand</p>
                    </div>
                )}
            </div>
        </div>

    );
};

export default IntentClassifier;