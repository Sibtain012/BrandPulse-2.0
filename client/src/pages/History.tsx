import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';
import Header from '../components/Header';

interface AnalysisHistory {
    history_id: number;
    keyword: string;
    start_date: string | null;
    end_date: string | null;
    total_posts: number;
    total_comments: number;
    dominant_sentiment: string;
    avg_post_sentiment_score: number | null;
    avg_comment_sentiment_score: number | null;
    avg_sentiment_score: number;
    request_id: number;
    analysis_timestamp: string;
    platform_id?: number; // 1 = Reddit, 2 = Twitter
}

// Platform icon component
const PlatformIcon: React.FC<{ platformId?: number }> = ({ platformId }) => {
    if (platformId === 2) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-blue-light/20 text-accent-blue-dark rounded-full text-xs font-medium">
                <span>🐦</span>
                <span>Twitter</span>
            </span>
        );
    }
    // Default to Reddit (platformId === 1 or undefined)
    return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-amber-light/20 text-accent-amber-dark rounded-full text-xs font-medium">
            <span>🔴</span>
            <span>Reddit</span>
        </span>
    );
};

const History = () => {
    const [analyses, setAnalyses] = useState<AnalysisHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            setError('');
            const userId = getCurrentUserId();

            const response = await axios.get(`http://localhost:3000/api/data/history/${userId}`);
            setAnalyses(response.data.analyses || []);
        } catch (err: any) {
            console.error('Failed to fetch history:', err);
            setError(err.response?.data?.error || 'Failed to load analysis history');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) {
            fetchHistory();
            return;
        }

        try {
            setLoading(true);
            const userId = getCurrentUserId();

            const response = await axios.get(
                `http://localhost:3000/api/data/history/${userId}/search?keyword=${encodeURIComponent(searchTerm)}`
            );
            setAnalyses(response.data.analyses || []);
        } catch (err: any) {
            console.error('Search failed:', err);
            setError('Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = (requestId: number) => {
        navigate(`/sentiment-analysis?requestId=${requestId}`);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getSentimentColor = (sentiment: string) => {
        switch (sentiment?.toLowerCase()) {
            case 'positive': return 'text-accent-green-dark bg-accent-green-light/20';
            case 'negative': return 'text-accent-red-dark bg-accent-red-light/20';
            case 'neutral': return 'text-light-600 bg-light-100';
            default: return 'text-light-600 bg-light-100';
        }
    };

    if (loading && analyses.length === 0) {
        return (
            <div className="min-h-screen bg-light-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand-600 mx-auto mb-4"></div>
                    <p className="text-light-600">Loading your analysis history...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pt-15">
            <Header />
            <div className="p-6 md:p-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-light-900 mb-2">Analysis History</h1>
                    <p className="text-light-600">View all your past sentiment analyses</p>
                </div>

                {/* Search Bar */}
                <div className="mb-6 flex gap-2">
                    <input
                        type="text"
                        placeholder="Search by keyword..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg  focus:border-transparent"
                    />
                    <button
                        onClick={handleSearch}
                        className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                    >
                        Search
                    </button>
                    {searchTerm && (
                        <button
                            onClick={() => {
                                setSearchTerm('');
                                fetchHistory();
                            }}
                            className="px-6 py-2 bg-light-200 text-light-700 rounded-lg hover:bg-light-300 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-4 bg-accent-red-light/10 border border-accent-red-light/30 rounded-lg">
                        <p className="text-accent-red-dark">{error}</p>
                    </div>
                )}

                {/* History Cards */}
                {analyses.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-md shadow">
                        <svg className="mx-auto h-12 w-12 text-light-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-light-900">No analyses found</h3>
                        <p className="mt-1 text-sm text-light-500">
                            {searchTerm ? 'Try a different search term' : 'Start by running your first sentiment analysis'}
                        </p>
                        {!searchTerm && (
                            <button
                                onClick={() => navigate('/sentiment-analysis')}
                                className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                            >
                                Run Analysis
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {analyses.map((analysis) => {
                            return (
                                <div
                                    key={analysis.history_id}
                                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
                                >
                                    {/* Keyword Header */}
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xl font-semibold text-gray-900">
                                                {analysis.keyword}
                                            </h3>
                                            <PlatformIcon platformId={analysis.platform_id} />
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {formatDate(analysis.analysis_timestamp)}
                                        </p>
                                    </div>

                                    {/* Date Range */}
                                    {(analysis.start_date || analysis.end_date) && (
                                        <div className="mb-4 text-sm text-gray-600">
                                            <span className="font-medium">Date Range:</span> {formatDate(analysis.start_date)} - {formatDate(analysis.end_date)}
                                        </div>
                                    )}

                                    {/* Stats */}
                                    <div className="mb-4 grid grid-cols-2 gap-4">
                                        <div className="bg-brand-50 rounded-lg p-3">
                                            <p className="text-2xl font-bold text-brand-600">{analysis.total_posts}</p>
                                            <p className="text-xs text-light-600">Posts</p>
                                        </div>
                                        <div className="bg-accent-teal-light/10 rounded-lg p-3">
                                            <p className="text-2xl font-bold text-accent-teal-dark">{analysis.total_comments}</p>
                                            <p className="text-xs text-light-600">Comments</p>
                                        </div>
                                    </div>

                                    {/* Dominant Sentiment Badge */}
                                    <div className="mb-4">
                                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(analysis.dominant_sentiment)}`}>
                                            {analysis.dominant_sentiment ? analysis.dominant_sentiment.charAt(0).toUpperCase() + analysis.dominant_sentiment.slice(1) : 'N/A'}
                                        </span>
                                    </div>

                                    {/* Sentiment Scores */}
                                    {(analysis.avg_post_sentiment_score !== null || analysis.avg_comment_sentiment_score !== null) && (
                                        <div className="mb-4 text-sm">
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-light-600">Posts Avg Score:</span>
                                                <span className="font-medium text-light-900">
                                                    {analysis.avg_post_sentiment_score !== null
                                                        ? Number(analysis.avg_post_sentiment_score).toFixed(3)
                                                        : 'N/A'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-light-600">Comments Avg Score:</span>
                                                <span className="font-medium text-light-900">
                                                    {analysis.avg_comment_sentiment_score !== null
                                                        ? Number(analysis.avg_comment_sentiment_score).toFixed(3)
                                                        : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Button */}
                                    <button
                                        onClick={() => handleViewDetails(analysis.request_id)}
                                        className="w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
                                    >
                                        View Details
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Results Count */}
                {analyses.length > 0 && (
                    <div className="mt-6 text-center text-light-600">
                        Showing {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'}
                    </div>
                )}
            </div>
        </div>

    );
};

export default History;
