import React, { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../hooks/useAnalysis';
import SentimentChart from '../components/SentimentChart';
import axios from 'axios';
import type { SentimentResponse } from '../utils/api';
import { getCurrentUserId } from '../utils/auth';

// Types for detailed data
interface PostDetail {
    id: number;
    title: string;
    body: string;
    subreddit: string;
    score: number;
    sentiment: string;
    confidence: number;
    url: string;
    created_at: string;
}

interface CommentDetail {
    id: number;
    body: string;
    score: number;
    sentiment: string;
    confidence: number;
    created_at: string;
    post_title: string;
    post_id: number;
}

interface DetailsResponse {
    posts: PostDetail[];
    comments: CommentDetail[];
}

// Ingestion stats from MongoDB
interface IngestionStats {
    processed: number;
    skipped_nsfw: number;
    skipped_non_english: number;
}

// Sentiment badge component
const SentimentBadge: React.FC<{ sentiment: string; confidence?: number }> = ({ sentiment, confidence }) => {
    const colors: Record<string, string> = {
        Positive: 'bg-green-100 text-green-700 border-green-200',
        Neutral: 'bg-gray-100 text-gray-700 border-gray-200',
        Negative: 'bg-red-100 text-red-700 border-red-200'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[sentiment] || colors.Neutral}`}>
            {sentiment} {confidence ? `(${(confidence * 100).toFixed(0)}%)` : ''}
        </span>
    );
};

const SentimentAnalysis: React.FC = () => {
    const [keyword, setKeyword] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [sentimentData, setSentimentData] = useState<SentimentResponse | null>(null);
    const [detailsData, setDetailsData] = useState<DetailsResponse | null>(null);
    const [ingestionStats, setIngestionStats] = useState<IngestionStats | null>(null);
    const [activeTab, setActiveTab] = useState<'charts' | 'posts' | 'comments'>('charts');
    const { status, startAnalysis, activeRequestId } = useAnalysis();

    // Fetch sentiment summary data with longer retry logic
    const fetchWithRetry = useCallback(async (rid: number, attempt = 1) => {
        try {
            // Wait longer on first attempt (5 seconds) to give pipeline time to start
            if (attempt === 1) await new Promise(r => setTimeout(r, 5000));

            const res = await axios.get<SentimentResponse>(`/api/data/results/${rid}`);

            if (res.data && res.data.totals && res.data.totals.total > 0) {
                console.log(`✅ Data ready! Posts: ${res.data.totals.posts}, Comments: ${res.data.totals.comments}`);
                setSentimentData(res.data);
                // Also fetch detailed data for proof
                const detailsRes = await axios.get<DetailsResponse>(`/api/data/details/${rid}`);
                setDetailsData(detailsRes.data);
                // Fetch ingestion stats from MongoDB
                const statsRes = await axios.get<IngestionStats>(`/api/data/ingestion-stats/${rid}`);
                setIngestionStats(statsRes.data);
            } else if (attempt < 12) { // Increased from 5 to 12 attempts (up to 2 minutes)
                const delay = attempt * 3000; // Increased delay: 3s, 6s, 9s, 12s, etc.
                console.warn(`⏳ Data not ready yet. Retry ${attempt}/12 in ${delay / 1000}s... (Request ID: ${rid})`);
                setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            } else {
                console.error(`❌ Timeout: No data found after ${attempt} attempts for Request ID: ${rid}`);
                setSentimentData(null);
                setDetailsData(null);
                setIngestionStats(null);
            }
        } catch (err) {
            console.error("Fetch Error:", err);
            if (attempt < 12) {
                const delay = attempt * 3000;
                console.warn(`⚠️ Fetch failed, retrying in ${delay / 1000}s...`);
                setTimeout(() => fetchWithRetry(rid, attempt + 1), delay);
            }
        }
    }, []);

    const handleRunPipeline = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keyword.trim()) return;

        // Get the actual logged-in user's ID from JWT token
        let userId = getCurrentUserId();

        // TEMPORARY FALLBACK: Use ID 1 if JWT parsing fails (check browser console for details)
        if (!userId) {
            console.warn('⚠️ Could not get user ID from JWT, using fallback ID: 1');
            console.warn('⚠️ Check browser console for JWT structure details');
            userId = 1; // Fallback to hardcoded ID
        }

        setSentimentData(null);
        setDetailsData(null);
        setIngestionStats(null);
        setActiveTab('charts');

        // Send dates to backend along with keyword and actual user ID
        const result = await startAnalysis(keyword, userId, startDate || null, endDate || null);

        // If cached results, immediately fetch the data
        if (result?.cached && result?.requestId) {
            console.log('📦 Loading cached results...');
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

    const hasData = sentimentData && sentimentData.totals && sentimentData.totals.total > 0;
    const currentDetailsData = detailsData;
    const isFiltered = Boolean(startDate || endDate);

    // Format date helper
    const formatDate = (dateStr: string) => {
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
        <div className="p-6 md:p-10 max-w-7xl mx-auto">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">BrandPulse Sentiment Analyzer</h1>
                <p className="text-gray-500">Real-time Reddit sentiment analysis powered by RoBERTa AI (ID: {activeRequestId || 'None'})</p>
            </header>

            <section className="bg-white p-6 rounded-xl shadow-sm border mb-8">
                <form onSubmit={handleRunPipeline} className="space-y-4">
                    {/* Keyword Input */}
                    <div className="flex gap-4">
                        <input
                            type="text"
                            className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Enter brand or keyword (e.g., iPhone 15, Tesla, Nike)"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            disabled={status === 'PROCESSING'}
                        />
                        <button
                            type="submit"
                            disabled={status === 'PROCESSING'}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-all"
                        >
                            {status === 'PROCESSING' ? 'Analyzing...' : 'Analyze Sentiment'}
                        </button>
                    </div>

                    {/* Date Range Filter - Always visible */}
                    <div className="border-t pt-4">
                        <div className="flex items-center gap-4 flex-wrap">
                            <label className="text-sm font-semibold text-gray-700">
                                📅 Filter by Date Range (Optional):
                            </label>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">From:</label>
                                <input
                                    type="date"
                                    className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    disabled={status === 'PROCESSING'}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">To:</label>
                                <input
                                    type="date"
                                    className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    disabled={status === 'PROCESSING'}
                                />
                            </div>
                            {(startDate || endDate) && (
                                <button
                                    type="button"
                                    onClick={handleClearDateFilter}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                                    disabled={status === 'PROCESSING'}
                                >
                                    Clear Dates
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {startDate || endDate
                                ? `Analysis will filter data from ${startDate || 'beginning'} to ${endDate || 'present'}`
                                : 'Leave empty to analyze all available data'
                            }
                        </p>
                    </div>
                </form>
            </section>

            {/* Status Bar */}
            <div className="flex items-center gap-4 mb-8 p-4 bg-gray-50 rounded-lg border">
                <span className="font-semibold text-gray-700">Pipeline Status:</span>
                <div className={`px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider ${status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
                    status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                    {status}
                </div>
                {hasData && (
                    <span className="ml-auto text-sm text-gray-500">
                        {isFiltered ? 'Filtered: ' : 'Analyzed: '}
                        {sentimentData.totals.posts} posts • {sentimentData.totals.comments} comments
                    </span>
                )}
            </div>

            {/* Results Section */}
            {status === 'COMPLETED' && hasData ? (
                <div className="space-y-8">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl text-white">
                            <p className="text-blue-100 text-sm font-medium">Total Analyzed</p>
                            <p className="text-4xl font-bold">{sentimentData.totals.total}</p>
                            <p className="text-blue-200 text-xs mt-1">posts + comments</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-xl text-white">
                            <p className="text-purple-100 text-sm font-medium">Posts</p>
                            <p className="text-4xl font-bold">{sentimentData.totals.posts}</p>
                            <p className="text-purple-200 text-xs mt-1">Reddit submissions</p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-xl text-white">
                            <p className="text-indigo-100 text-sm font-medium">Comments</p>
                            <p className="text-4xl font-bold">{sentimentData.totals.comments}</p>
                            <p className="text-indigo-200 text-xs mt-1">user responses</p>
                        </div>
                    </div>

                    {/* Ingestion Statistics */}
                    {ingestionStats && !isFiltered && (
                        <div className="bg-white p-5 rounded-xl border shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <span className="text-xl">📥</span> Ingestion Statistics
                            </h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                    <p className="text-green-600 text-xs font-medium uppercase tracking-wide">Processed</p>
                                    <p className="text-2xl font-bold text-green-700">{ingestionStats.processed}</p>
                                    <p className="text-green-500 text-xs mt-1">Reddit posts fetched</p>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                                    <p className="text-orange-600 text-xs font-medium uppercase tracking-wide">Skipped (NSFW)</p>
                                    <p className="text-2xl font-bold text-orange-700">{ingestionStats.skipped_nsfw}</p>
                                    <p className="text-orange-500 text-xs mt-1">Adult content filtered</p>
                                </div>
                                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-600 text-xs font-medium uppercase tracking-wide">Skipped (Non-English)</p>
                                    <p className="text-2xl font-bold text-yellow-700">{ingestionStats.skipped_non_english}</p>
                                    <p className="text-yellow-500 text-xs mt-1">Language filtered</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab('charts')}
                            className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'charts'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            📊 Charts
                        </button>
                        <button
                            onClick={() => setActiveTab('posts')}
                            className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'posts'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            📝 Posts ({currentDetailsData?.posts.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('comments')}
                            className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'comments'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            💬 Comments ({currentDetailsData?.comments.length || 0})
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'charts' && (
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
                    )}

                    {activeTab === 'posts' && currentDetailsData && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500">
                                Showing {currentDetailsData.posts.length} posts analyzed by RoBERTa sentiment model
                                {isFiltered && ' (filtered by date range)'}
                            </p>
                            {currentDetailsData.posts.length === 0 ? (
                                <div className="p-6 bg-gray-50 text-gray-600 rounded-lg border text-center">
                                    No posts found in the selected date range. Try adjusting your filter.
                                </div>
                            ) : (
                                currentDetailsData.posts.map((post) => (
                                    <div key={post.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                                        r/{post.subreddit}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {formatDate(post.created_at)}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        ⬆️ {post.score}
                                                    </span>
                                                </div>
                                                <h4 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                                                    {post.title}
                                                </h4>
                                                {post.body && (
                                                    <p className="text-sm text-gray-600 line-clamp-3">
                                                        {post.body}
                                                    </p>
                                                )}
                                                {post.url && (
                                                    <a
                                                        href={post.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-500 hover:underline mt-2 inline-block"
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
                            <p className="text-sm text-gray-500">
                                Showing {currentDetailsData.comments.length} comments analyzed by RoBERTa sentiment model
                                {isFiltered && ' (filtered by date range)'}
                            </p>
                            {currentDetailsData.comments.length === 0 ? (
                                <div className="p-6 bg-gray-50 text-gray-600 rounded-lg border text-center">
                                    No comments found in the selected date range. Try adjusting your filter.
                                </div>
                            ) : (
                                currentDetailsData.comments.map((comment) => (
                                    <div key={comment.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs text-gray-400">
                                                        On: "{comment.post_title?.slice(0, 50)}..."
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        ⬆️ {comment.score}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                    "{comment.body}"
                                                </p>
                                                <p className="text-xs text-gray-400 mt-2">
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
            ) : status === 'COMPLETED' && !hasData ? (
                <div className="p-6 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                    <p className="font-bold">No Results Found</p>
                    <p className="text-sm">No relevant Reddit data was found for this keyword. Try a different search term.</p>
                </div>
            ) : status === 'PROCESSING' ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                    <p className="text-gray-600 font-medium">Analyzing Reddit data...</p>
                    <p className="text-gray-400 text-sm mt-2">Request #{activeRequestId} • This may take 30-60 seconds</p>
                </div>
            ) : status === 'FAILED' ? (
                <div className="p-6 bg-red-50 text-red-700 rounded-lg border border-red-200">
                    <p className="font-bold">Pipeline Error</p>
                    <p className="text-sm">Check server logs for Request #{activeRequestId}.</p>
                </div>
            ) : (
                <div className="text-center py-20 text-gray-400 border border-dashed rounded-xl bg-gray-50">
                    <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-500">Enter a keyword to analyze brand sentiment</p>
                    <p className="text-sm text-gray-400 mt-2">Powered by the Medallion Architecture Pipeline</p>
                </div>
            )}
        </div>
    );
};

export default SentimentAnalysis;
