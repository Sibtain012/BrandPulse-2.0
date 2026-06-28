import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../hooks/useAnalysis';
import ComplaintChart from '../components/ComplaintChart';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';
import Header from '../components/Header';

// Complaint badge component
const ComplaintBadge = ({ label, confidence }) => {
    const colors = {
        Complaint: 'bg-red-100/20 text-red-700 border-red-300',
        'Non-Complaint': 'bg-emerald-100/20 text-emerald-700 border-emerald-300',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[label] || colors['Non-Complaint']}`}>
            {label} {confidence ? `(${(confidence * 100).toFixed(0)}%)` : ''}
        </span>
    );
};

const ComplaintAnalysis = () => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [platform, setPlatform] = useState('reddit');
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

    const fetchWithRetry = useCallback(async (rid, attempt = 1) => {
        try {
            if (attempt === 1) {
                setLoadingResults(true);
                setLoadingMessage('Preparing your results...');
                await new Promise(r => setTimeout(r, 5000));
            } else if (attempt <= 4) {
                setLoadingMessage('Loading analysis data...');
            } else {
                setLoadingMessage('Finalizing charts...');
            }

            const res = await axios.get(`/api/data/complaint/results/${rid}?platform=${platform}`);

            if (res.data && res.data.totals && res.data.totals.total > 0) {
                setLoadingMessage('Analysis Complete!');
                setComplaintData(res.data);
                setLoadingResults(false);
                const detailsRes = await axios.get(`/api/data/complaint/details/${rid}?platform=${platform}`);
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
    }, [platform]);

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

        // Pass 'complaint' as the analysisMode (6th argument)
        const result = await startAnalysis(
            keyword, userId, startDate || null, endDate || null, platform, 'complaint'
        );

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

    useEffect(() => {
        const requestIdParam = searchParams.get('requestId');
        if (requestIdParam) {
            const rid = parseInt(requestIdParam, 10);
            if (!isNaN(rid)) {
                setHistoricalRequestId(rid);
                const loadHistoricalData = async () => {
                    try {
                        const histPlatform = searchParams.get('platform') || platform;
                        const res = await axios.get(`/api/data/complaint/results/${rid}?platform=${histPlatform}`);
                        if (res.data && res.data.totals && res.data.totals.total > 0) {
                            setComplaintData(res.data);
                            if (res.data.platform) setPlatform(res.data.platform);
                            const detailsRes = await axios.get(`/api/data/complaint/details/${rid}?platform=${histPlatform}`);
                            setDetailsData(detailsRes.data);
                        }
                    } catch (err) {
                        // Silent failure
                    }
                };
                loadHistoricalData();
            }
        }
    }, [searchParams]);

    const hasData = complaintData && complaintData.totals && complaintData.totals.total > 0;
    const currentDetailsData = detailsData;
    const isFiltered = Boolean(startDate || endDate);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className='pt-15'>
            <Header />
            <div className="p-6 md:p-10 max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-light-800">BrandPulse Complaint Classifier</h1>
                    <p className="text-light-500 mt-1">Detect which posts are complaints vs non-complaints</p>
                </header>

                {!historicalRequestId && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border mb-8">
                        <form onSubmit={handleRunPipeline} className="space-y-4">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-semibold text-light-700">Platform:</span>
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${platform === 'reddit' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-light-200 text-light-600'}`}>
                                    <input type="radio" name="platform" value="reddit" checked={platform === 'reddit'} onChange={(e) => setPlatform(e.target.value)} disabled={status === 'PROCESSING'} className="accent-brand-600" />
                                    <span className="text-sm font-medium flex items-center gap-1">
                                        <img src="/images/reddit-logo.png" alt="Reddit" className="w-4 h-4 object-contain" />
                                        Reddit
                                    </span>
                                </label>
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${platform === 'twitter' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-light-200 text-light-600'}`}>
                                    <input type="radio" name="platform" value="twitter" checked={platform === 'twitter'} onChange={(e) => setPlatform(e.target.value)} disabled={status === 'PROCESSING'} className="accent-brand-600" />
                                    <span className="text-sm font-medium flex items-center gap-1">
                                        <img src="/images/twitter-logo.jpg" alt="Twitter" className="w-4 h-4 object-contain rounded-sm" />
                                        Twitter
                                    </span>
                                </label>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <input
                                    type="text"
                                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-full"
                                    placeholder="Enter brand or keyword (e.g., iPhone 15, Tesla, Nike)"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    disabled={status === 'PROCESSING'}
                                />
                                <button
                                    type="submit"
                                    disabled={status === 'PROCESSING' || loadingResults}
                                    className="w-full sm:w-auto px-8 py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 disabled:bg-light-400 transition-all whitespace-nowrap"
                                >
                                    {status === 'PROCESSING' ? 'Analyzing...' : loadingResults ? 'Loading...' : 'Classify Complaints'}
                                </button>
                            </div>

                            <div className="border-t pt-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                                    <label className="text-sm font-semibold text-light-700 w-full sm:w-auto">
                                        📅 Filter by Date Range (Optional):
                                    </label>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">From:</label>
                                        <input type="date" className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={status === 'PROCESSING'} />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">To:</label>
                                        <input type="date" className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={status === 'PROCESSING'} />
                                    </div>
                                    {(startDate || endDate) && (
                                        <button type="button" onClick={handleClearDateFilter} className="w-full sm:w-auto px-4 py-2 bg-light-200 text-light-700 rounded-lg text-sm font-medium hover:bg-light-300 transition-colors" disabled={status === 'PROCESSING'}>
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

                {historicalRequestId && (
                    <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">📂</span>
                            <div>
                                <p className="font-semibold text-amber-800">Viewing Past Complaint Analysis</p>
                                <p className="text-sm text-amber-700">Showing previously analyzed data</p>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'PROCESSING' && (
                    <div className="text-center py-16 bg-gradient-to-br from-brand-50 to-accent-blue-light/10 rounded-xl border-2 border-brand-200">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-brand-500 border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">This usually takes 30-60 seconds</p>
                    </div>
                )}

                {hasData && (status === 'COMPLETED' || historicalRequestId) && !historicalRequestId && (
                    <div className="flex items-center gap-2 p-3 bg-accent-green-light/10 border border-accent-green-light/30 rounded-lg mb-6">
                        <span className="text-accent-green-dark">✓</span>
                        <span className="text-sm text-accent-green-dark font-medium">
                            Complaint classification complete: {complaintData.totals.total} items analyzed
                        </span>
                    </div>
                )}

                {(status === 'COMPLETED' || historicalRequestId) && hasData ? (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-6 rounded-xl text-white">
                                <p className="text-brand-100 text-sm font-medium">Total Classified</p>
                                <p className="text-4xl font-bold">{complaintData.totals.total}</p>
                                <p className="text-brand-200 text-xs mt-1">{platform === 'twitter' ? 'tweets' : 'posts'}</p>
                            </div>
                            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-xl text-white">
                                <p className="text-rose-100 text-sm font-medium">Analysis Mode</p>
                                <p className="text-4xl font-bold">Complaint</p>
                                <p className="text-rose-200 text-xs mt-1">Complaint · Non-Complaint</p>
                            </div>
                        </div>

                        <div className="flex border-b border-light-200 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('charts')}
                                className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'charts'
                                    ? 'text-brand-600 border-b-2 border-brand-600'
                                    : 'text-light-500 hover:text-light-700'
                                    }`}
                            >
                                📊 Charts
                            </button>
                            {platform === 'twitter' ? (
                                <button
                                    onClick={() => setActiveTab('tweets')}
                                    className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'tweets'
                                        ? 'text-brand-600 border-b-2 border-brand-600'
                                        : 'text-light-500 hover:text-light-700'
                                        }`}
                                >
                                    <span className="flex items-center gap-1">
                                        <img src="/images/twitter-logo.jpg" alt="Twitter" className="w-4 h-4 object-contain rounded-sm" />
                                        Tweets ({currentDetailsData?.tweets?.length || 0})
                                    </span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => setActiveTab('posts')}
                                    className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'posts'
                                        ? 'text-brand-600 border-b-2 border-brand-600'
                                        : 'text-light-500 hover:text-light-700'
                                        }`}
                                >
                                    📝 Posts ({currentDetailsData?.posts?.length || 0})
                                </button>
                            )}
                        </div>

                        {activeTab === 'charts' && (
                            <div className="grid grid-cols-1 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-lg border">
                                    <ComplaintChart
                                        data={complaintData.posts}
                                        title="Complaint Classification"
                                        subtitle={`Based on ${complaintData.totals.total} ${platform === 'twitter' ? 'tweets' : 'posts'}${isFiltered ? ' (filtered)' : ''}`}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'tweets' && currentDetailsData && platform === 'twitter' && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing {currentDetailsData.tweets?.length || 0} tweets classified
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {(!currentDetailsData.tweets || currentDetailsData.tweets.length === 0) ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No tweets found in the selected date range.
                                    </div>
                                ) : (
                                    currentDetailsData.tweets.map((tweet) => (
                                        <div key={tweet.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                            <img src="/images/twitter-logo.jpg" alt="Twitter" className="w-3 h-3 object-contain rounded-xs" />
                                                            Twitter
                                                        </span>
                                                        <span className="text-xs text-light-400">{formatDate(tweet.created_at)}</span>
                                                        <span className="text-xs text-light-400">❤️ {tweet.score}</span>
                                                        <span className="text-xs text-light-400">🔁 {tweet.retweet_count}</span>
                                                    </div>
                                                    <p className="text-sm text-light-700 leading-relaxed whitespace-pre-wrap">
                                                        {tweet.body}
                                                    </p>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <ComplaintBadge label={tweet.intent} confidence={tweet.confidence} />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'posts' && currentDetailsData && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing {currentDetailsData.posts.length} posts classified by complaint status
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.posts.length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No posts found in the selected date range. Try adjusting your filter.
                                    </div>
                                ) : (
                                    currentDetailsData.posts.map((post) => (
                                        <div key={post.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded">
                                                            r/{post.subreddit}
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            {formatDate(post.created_at)}
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            ⬆️ {post.score}
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
                                                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-500 hover:underline mt-2 inline-block">
                                                            View on Reddit →
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <ComplaintBadge label={post.intent} confidence={post.confidence} />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : loadingResults ? (
                    <div className="text-center py-16 bg-gradient-to-br from-accent-green-light/10 to-accent-teal-light/10 rounded-xl border-2 border-accent-green-light/30">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-accent-green border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">Almost there...</p>
                    </div>
                ) : status === 'COMPLETED' && !hasData ? (
                    <div className="text-center py-12 bg-amber-50 rounded-xl border-2 border-amber-300">
                        <h3 className="text-xl font-bold text-amber-900 mb-2">No Results Found</h3>
                        <p className="text-amber-800 mb-4 max-w-md mx-auto">
                            The analysis completed but no data matched your query. Try a different keyword or broaden your date range.
                        </p>
                    </div>
                ) : status === 'FAILED' ? (
                    <div className="p-6 bg-accent-red-light/10 text-accent-red-dark rounded-lg border border-accent-red-light/30">
                        <p className="font-bold">Pipeline Error</p>
                        <p className="text-sm">Check server logs for Request #{activeRequestId}.</p>
                    </div>
                ) : (
                    <div className="text-center py-20 text-light-400 border border-dashed rounded-xl bg-light-50">
                        <svg className="mx-auto h-16 w-16 text-light-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <p className="text-lg font-medium text-light-500">Enter a keyword to detect complaints</p>
                        <p className="text-sm text-light-400 mt-2">Powered by AI complaint classification</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ComplaintAnalysis;
