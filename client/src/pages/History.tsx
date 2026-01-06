import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getCurrentUserId } from '../utils/auth';

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
}

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
            case 'positive': return 'text-green-600 bg-green-100';
            case 'negative': return 'text-red-600 bg-red-100';
            case 'neutral': return 'text-gray-600 bg-gray-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    if (loading && analyses.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading your analysis history...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Analysis History</h1>
                    <p className="text-gray-600">View all your past sentiment analyses</p>
                </div>

                {/* Search Bar */}
                <div className="mb-6 flex gap-2">
                    <input
                        type="text"
                        placeholder="Search by keyword..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                        onClick={handleSearch}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Search
                    </button>
                    {searchTerm && (
                        <button
                            onClick={() => {
                                setSearchTerm('');
                                fetchHistory();
                            }}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-600">{error}</p>
                    </div>
                )}

                {/* History Cards */}
                {analyses.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg shadow">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No analyses found</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {searchTerm ? 'Try a different search term' : 'Start by running your first sentiment analysis'}
                        </p>
                        {!searchTerm && (
                            <button
                                onClick={() => navigate('/sentiment-analysis')}
                                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                                        <h3 className="text-xl font-semibold text-gray-900 mb-1">
                                            {analysis.keyword}
                                        </h3>
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
                                        <div className="bg-blue-50 rounded-lg p-3">
                                            <p className="text-2xl font-bold text-blue-600">{analysis.total_posts}</p>
                                            <p className="text-xs text-gray-600">Posts</p>
                                        </div>
                                        <div className="bg-purple-50 rounded-lg p-3">
                                            <p className="text-2xl font-bold text-purple-600">{analysis.total_comments}</p>
                                            <p className="text-xs text-gray-600">Comments</p>
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
                                                <span className="text-gray-600">Posts Avg Score:</span>
                                                <span className="font-medium text-gray-900">
                                                    {analysis.avg_post_sentiment_score !== null
                                                        ? Number(analysis.avg_post_sentiment_score).toFixed(3)
                                                        : 'N/A'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-gray-600">Comments Avg Score:</span>
                                                <span className="font-medium text-gray-900">
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
                                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
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
                    <div className="mt-6 text-center text-gray-600">
                        Showing {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default History;
