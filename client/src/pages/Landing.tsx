import Header from '../components/Header';
import Footer from '../components/Footer';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart2, Shield, Clock } from 'lucide-react';

const Landing = () => {
    return (
        <div className="font-sans bg-white min-h-screen flex flex-col">
            <Header />

            {/* --- HERO SECTION --- */}
            <main className="grow pt-32 pb-20 px-6">
                <div className="max-w-7xl mx-auto text-center space-y-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-bold uppercase tracking-wider animate-fade-in">
                        <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse"></span>
                        Now in Public Beta
                    </div>

                    <h1 className="text-5xl md:text-7xl font-display font-bold text-light-900 leading-tight animate-slide-up">
                        Understand Your <br />
                        <span className="text-gradient">Brand's Heartbeat</span>
                    </h1>

                    <p className="text-xl text-light-500 max-w-2xl mx-auto animate-slide-up delay-100">
                        Real-time sentiment analysis, crisis detection, and competitive benchmarking for modern enterprises.
                    </p>

                    {/* Primary CTAs - Navigate to Main Features */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4 animate-slide-up delay-200">
                        <Link
                            to="/sentiment-analysis"
                            className="btn btn-primary px-8 py-4 text-lg shadow-brand-600/30 flex items-center justify-center gap-2 group"
                        >
                            <BarChart2 className="w-5 h-5" />
                            Analyze Brand Sentiment
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link
                            to="/history"
                            className="btn bg-white border border-light-200 text-light-700 hover:bg-light-50 px-8 py-4 text-lg flex items-center justify-center gap-2"
                        >
                            <Clock className="w-5 h-5" />
                            View History
                        </Link>
                    </div>

                    {/* Clickable Feature Cards */}
                    <div className="grid md:grid-cols-3 gap-6 mt-20 text-left">
                        {/* Sentiment Analysis Card */}
                        <Link
                            to="/sentiment-analysis"
                            className="group p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                                    <BarChart2 className="w-6 h-6" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-blue-600 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="font-bold text-lg text-gray-900">Sentiment Analysis</h3>
                            <p className="text-gray-600 mt-2">Analyze brand sentiment from Reddit & Twitter in real-time using AI</p>
                            <span className="mt-4 text-blue-600 font-medium text-sm inline-block">Start analyzing →</span>
                        </Link>

                        {/* History Card */}
                        <Link
                            to="/history"
                            className="group p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 hover:border-purple-400 hover:shadow-xl transition-all duration-300"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-purple-600">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="font-bold text-lg text-gray-900">Analysis History</h3>
                            <p className="text-gray-600 mt-2">View past analyses and track sentiment trends over time</p>
                            <span className="mt-4 text-purple-600 font-medium text-sm inline-block">View history →</span>
                        </Link>

                        {/* Profile Card */}
                        <Link
                            to="/profile"
                            className="group p-6 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 border border-green-200 hover:border-green-400 hover:shadow-xl transition-all duration-300"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-green-600">
                                    <Shield className="w-6 h-6" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-green-600 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="font-bold text-lg text-gray-900">Profile & Security</h3>
                            <p className="text-gray-600 mt-2">Manage your account and enable two-factor authentication</p>
                            <span className="mt-4 text-green-600 font-medium text-sm inline-block">Manage account →</span>
                        </Link>
                    </div>

                    {/* Platform Badges */}
                    <div className="mt-16 pt-8 border-t border-gray-100">
                        <p className="text-sm text-gray-400 mb-4">Supported Platforms</p>
                        <div className="flex justify-center gap-6">
                            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full">
                                <span className="text-xl">🔴</span>
                                <span className="font-medium text-orange-700">Reddit</span>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full">
                                <span className="text-xl">🐦</span>
                                <span className="font-medium text-blue-700">Twitter</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default Landing;
