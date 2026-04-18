import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../hooks/useAnalysis';
import SentimentChart from '../components/SentimentChart';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';
import Header from '../components/Header';

// Sentiment badge component
const SentimentBadge = ({ sentiment, confidence }) => {
    const colors = {
        Positive: 'bg-accent-green-light/20 text-accent-green-dark border-accent-green-light',
        Neutral: 'bg-light-100 text-light-700 border-light-200',
        Negative: 'bg-accent-red-light/20 text-accent-red-dark border-accent-red-light'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[sentiment] || colors.Neutral}`}>
            {sentiment} {confidence ? `(${(confidence * 100).toFixed(0)}%)` : ''}
        </span>
    );
};

const SentimentAnalysis = () => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [platform, setPlatform] = useState('reddit');
    const [sentimentData, setSentimentData] = useState(null);
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

    // Fetch sentiment summary data with longer retry logic
    const fetchWithRetry = useCallback(async (rid, attempt = 1) => {
        try {
            // Show loading state on first attempt
            if (attempt === 1) {
                setLoadingResults(true);
                setLoadingMessage('Preparing your results...');
                await new Promise(r => setTimeout(r, 5000));
            } else if (attempt <= 4) {
                setLoadingMessage('Loading analysis data...');
            } else {
                setLoadingMessage('Finalizing charts...');
            }

            const res = await axios.get(`/api/data/results/${rid}?platform=${platform}`);

            if (res.data && res.data.totals && res.data.totals.total > 0) {
                console.log(`✅ Data ready! Posts: ${res.data.totals.posts}, Comments: ${res.data.totals.comments}`);
                setLoadingMessage('Analysis in Progress!');
                setSentimentData(res.data);
                setLoadingResults(false);
                // Also fetch detailed data for proof
                const detailsRes = await axios.get(`/api/data/details/${rid}?platform=${platform}`);
                setDetailsData(detailsRes.data);
            } else if (attempt < 5) {
                const delay = attempt * 3000; // Increased delay: 3s, 6s, 9s, 12s, etc.
                timeoutRef.current = setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            } else {
                setSentimentData(null);
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

        // Get the actual logged-in user's ID from JWT token
        let userId = getCurrentUserId();

        if (!userId) {
            navigate('/login');
            return;
        }

        setSentimentData(null);
        setDetailsData(null);
        setActiveTab('charts');

        // Send dates to backend along with keyword, user ID, and selected platform
        const result = await startAnalysis(keyword, userId, startDate || null, endDate || null, platform);

        // If cached results (≥75% coverage), immediately fetch the data
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

    // Load historical data from URL query param (when coming from History page)
    useEffect(() => {
        const requestIdParam = searchParams.get('requestId');
        if (requestIdParam) {
            const rid = parseInt(requestIdParam, 10);
            if (!isNaN(rid)) {
                setHistoricalRequestId(rid);

                // Fetch the historical data
                const loadHistoricalData = async () => {
                    try {
                        const histPlatform = searchParams.get('platform') || platform;
                        const res = await axios.get(`/api/data/results/${rid}?platform=${histPlatform}`);
                        if (res.data && res.data.totals && res.data.totals.total > 0) {
                            setSentimentData(res.data);
                            if (res.data.platform) setPlatform(res.data.platform);

                            // Also fetch details
                            const detailsRes = await axios.get(`/api/data/details/${rid}?platform=${histPlatform}`);
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

    const hasData = sentimentData && sentimentData.totals && sentimentData.totals.total > 0;
    const currentDetailsData = detailsData;
    const isFiltered = Boolean(startDate || endDate);

    // Format date helper
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Get date range from data
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
                    <h1 className="text-3xl font-bold text-light-800">BrandPulse Sentiment Analyzer</h1>
                </header>

                {/* Analysis Form - Hidden when viewing historical data */}
                {!historicalRequestId && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border mb-8">
                        <form onSubmit={handleRunPipeline} className="space-y-4">
                            {/* Platform selector */}
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-semibold text-light-700">Platform:</span>
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${platform === 'reddit' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-light-200 text-light-600'}`}>
                                    <input
                                        type="radio"
                                        name="platform"
                                        value="reddit"
                                        checked={platform === 'reddit'}
                                        onChange={(e) => setPlatform(e.target.value)}
                                        disabled={status === 'PROCESSING'}
                                        className="accent-brand-600"
                                    />
                                    <span className="text-sm font-medium">🟠 Reddit</span>
                                </label>
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${platform === 'twitter' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-light-200 text-light-600'}`}>
                                    <input
                                        type="radio"
                                        name="platform"
                                        value="twitter"
                                        checked={platform === 'twitter'}
                                        onChange={(e) => setPlatform(e.target.value)}
                                        disabled={status === 'PROCESSING'}
                                        className="accent-brand-600"
                                    />
                                    <span className="text-sm font-medium">🐦 Twitter</span>
                                </label>
                            </div>

                            {/* Keyword Input */}
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
                                    {status === 'PROCESSING' ? 'Analyzing...' : loadingResults ? 'Loading...' : 'Analyze Sentiment'}
                                </button>
                            </div>

                            {/* Date Range Filter - Always visible */}
                            <div className="border-t pt-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                                    <label className="text-sm font-semibold text-light-700 w-full sm:w-auto">
                                        📅 Filter by Date Range (Optional):
                                    </label>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            disabled={status === 'PROCESSING'}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <label className="text-sm text-light-600 whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            className="flex-1 sm:flex-initial p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
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
                                            disabled={status === 'PROCESSING'}
                                        >
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
                                <p className="text-sm text-amber-700">
                                    Showing previously analyzed data
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading Indicator - Only show when processing */}
                {status === 'PROCESSING' && (
                    <div className="text-center py-16 bg-gradient-to-br from-brand-50 to-accent-blue-light/10 rounded-xl border-2 border-brand-200">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-brand-500 border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">This usually takes 30-60 seconds</p>
                    </div>
                )}

                {/* Results Summary - Only show when data exists */}
                {hasData && (status === 'COMPLETED' || historicalRequestId) && !historicalRequestId && (
                    <div className="flex items-center gap-2 p-3 bg-accent-green-light/10 border border-accent-green-light/30 rounded-lg mb-6">
                        <span className="text-accent-green-dark">✓</span>
                        <span className="text-sm text-accent-green-dark font-medium">
                            Analysis complete: {sentimentData.totals.posts} posts • {sentimentData.totals.comments} comments
                        </span>
                    </div>
                )}

                {/* Results Section */}
                {(status === 'COMPLETED' || historicalRequestId) && hasData ? (
                    <div className="space-y-8">
                        {/* Summary Stats */}
                        {platform === 'twitter' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-6 rounded-xl text-white">
                                    <p className="text-brand-100 text-sm font-medium">Total Analyzed</p>
                                    <p className="text-4xl font-bold">{sentimentData.totals.total}</p>
                                    <p className="text-brand-200 text-xs mt-1">tweets</p>
                                </div>
                                <div className="bg-gradient-to-br from-accent-blue to-accent-blue-dark p-6 rounded-xl text-white">
                                    <p className="text-white/80 text-sm font-medium">Tweets</p>
                                    <p className="text-4xl font-bold">{sentimentData.totals.posts}</p>
                                    <p className="text-white/70 text-xs mt-1">Twitter posts</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-6 rounded-xl text-white">
                                    <p className="text-brand-100 text-sm font-medium">Total Analyzed</p>
                                    <p className="text-4xl font-bold">{sentimentData.totals.total}</p>
                                    <p className="text-brand-200 text-xs mt-1">posts + comments</p>
                                </div>
                                <div className="bg-gradient-to-br from-accent-teal to-accent-teal-dark p-6 rounded-xl text-white">
                                    <p className="text-white/80 text-sm font-medium">Posts</p>
                                    <p className="text-4xl font-bold">{sentimentData.totals.posts}</p>
                                    <p className="text-white/70 text-xs mt-1">Reddit submissions</p>
                                </div>
                                <div className="bg-gradient-to-br from-accent-blue to-accent-blue-dark p-6 rounded-xl text-white">
                                    <p className="text-white/80 text-sm font-medium">Comments</p>
                                    <p className="text-4xl font-bold">{sentimentData.totals.comments}</p>
                                    <p className="text-white/70 text-xs mt-1">user responses</p>
                                </div>
                            </div>
                        )}


                        {/* Tab Navigation */}
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
                                    🐦 Tweets ({currentDetailsData?.tweets?.length || 0})
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setActiveTab('posts')}
                                        className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'posts'
                                            ? 'text-brand-600 border-b-2 border-brand-600'
                                            : 'text-light-500 hover:text-light-700'
                                            }`}
                                    >
                                        📝 Posts ({currentDetailsData?.posts?.length || 0})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('comments')}
                                        className={`px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'comments'
                                            ? 'text-brand-600 border-b-2 border-brand-600'
                                            : 'text-light-500 hover:text-light-700'
                                            }`}
                                    >
                                        💬 Comments ({currentDetailsData?.comments?.length || 0})
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'charts' && (
                            platform === 'twitter' ? (
                                <div className="grid grid-cols-1 gap-6">
                                    <div className="bg-white p-6 rounded-xl shadow-lg border">
                                        <SentimentChart
                                            data={sentimentData.posts}
                                            title="Tweet Sentiment"
                                            subtitle={`Based on ${sentimentData.totals.posts} tweets${isFiltered ? ' (filtered)' : ''}`}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-xl shadow-lg border">
                                        <SentimentChart
                                            data={sentimentData.posts}
                                            title="Post Sentiment"
                                            subtitle={`Based on ${sentimentData.totals.posts} Reddit posts${isFiltered ? ' (filtered)' : ''}`}
                                        />
                                    </div>
                                    <div className="bg-white p-6 rounded-xl shadow-lg border">
                                        <SentimentChart
                                            data={sentimentData.comments}
                                            title="Comment Sentiment"
                                            subtitle={`Based on ${sentimentData.totals.comments} user comments${isFiltered ? ' (filtered)' : ''}`}
                                        />
                                    </div>
                                </div>
                            )
                        )}

                        {activeTab === 'tweets' && currentDetailsData && platform === 'twitter' && (
                            <div className="space-y-4">
                                <p className="text-sm text-light-500">
                                    Showing {currentDetailsData.tweets?.length || 0} tweets analyzed
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
                                                        <span className="text-xs text-light-400 bg-light-100 px-2 py-0.5 rounded">🐦 Twitter</span>
                                                        <span className="text-xs text-light-400">{formatDate(tweet.created_at)}</span>
                                                        <span className="text-xs text-light-400">❤️ {tweet.score}</span>
                                                        <span className="text-xs text-light-400">🔁 {tweet.retweet_count}</span>
                                                        <span className="text-xs text-light-400">💬 {tweet.reply_count}</span>
                                                    </div>
                                                    <p className="text-sm text-light-700 leading-relaxed whitespace-pre-wrap">
                                                        {tweet.body}
                                                    </p>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <SentimentBadge
                                                        sentiment={tweet.sentiment}
                                                        confidence={tweet.confidence}
                                                    />
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
                                    Showing {currentDetailsData.posts.length} posts analyzed during Sentiment Analysis
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
                                                    <SentimentBadge
                                                        sentiment={post.sentiment}
                                                        confidence={post.confidence}
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
                                    Showing {currentDetailsData.comments.length} comments analyzed during Sentiment Analysis
                                    {isFiltered && ' (filtered by date range)'}
                                </p>
                                {currentDetailsData.comments.length === 0 ? (
                                    <div className="p-6 bg-light-50 text-light-600 rounded-lg border text-center">
                                        No comments found in the selected date range. Try adjusting your filter.
                                    </div>
                                ) : (
                                    currentDetailsData.comments.map((comment) => (
                                        <div key={comment.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs text-light-400">
                                                            On: "{comment.post_title?.slice(0, 50)}..."
                                                        </span>
                                                        <span className="text-xs text-light-400">
                                                            ⬆️ {comment.score}
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
                                                    <SentimentBadge
                                                        sentiment={comment.sentiment}
                                                        confidence={comment.confidence}
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
                    <div className="text-center py-16 bg-gradient-to-br from-accent-green-light/10 to-accent-teal-light/10 rounded-xl border-2 border-accent-green-light/30">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-accent-green border-t-transparent mb-6"></div>
                        <p className="text-xl font-semibold text-light-800 mb-2">{loadingMessage}</p>
                        <p className="text-sm text-light-500">Almost there...</p>
                    </div>
                ) : status === 'COMPLETED' && !hasData ? (
                    <div className="text-center py-12 bg-amber-50 rounded-xl border-2 border-amber-300">
                        <div className="mb-4">
                            <svg className="mx-auto h-16 w-16 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-amber-900 mb-2">No Results Found</h3>
                        <p className="text-amber-800 mb-4 max-w-md mx-auto">
                            The analysis completed successfully, but no Reddit posts were found for this keyword.
                        </p>
                        <div className="bg-white border border-amber-200 rounded-lg p-4 max-w-lg mx-auto text-left">
                            <p className="font-semibold text-amber-900 mb-2 text-sm">💡 Try these suggestions:</p>
                            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                                <li>Use a more popular or general search term</li>
                                <li>Check spelling and try different variations</li>
                                <li>Search for well-known brands with active discussions</li>
                                <li>Try removing date filters if you're using them</li>
                            </ul>
                        </div>
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
                        <p className="text-lg font-medium text-light-500">Enter a keyword to analyze brand sentiment</p>
                        <p className="text-sm text-light-400 mt-2">Powered by AI sentiment analysis</p>
                    </div>
                )}
            </div>
        </div>

    );
};

export default SentimentAnalysis;
