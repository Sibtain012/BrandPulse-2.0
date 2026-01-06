import Header from '../components/Header';
import Footer from '../components/Footer';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart2, Shield, Zap } from 'lucide-react';

const Landing = () => {
    return (
        <div className="font-sans bg-white min-h-screen flex flex-col">
            <Header />

            {/* --- HERO SECTION (Placeholder) --- */}
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

                    <div className="flex justify-center gap-4 animate-slide-up delay-200">
                        <Link to="/register" className="btn btn-primary px-8 py-4 text-lg shadow-brand-600/30">
                            Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
                        </Link>
                        <Link to="/login" className="btn bg-white border border-light-200 text-light-700 hover:bg-light-50 px-8 py-4 text-lg">
                            View Demo
                        </Link>
                    </div>

                    {/* Feature Grid Preview */}
                    <div className="grid md:grid-cols-3 gap-8 mt-20 text-left">
                        {[
                            { icon: Zap, title: "Real-Time", desc: "Live data ingestion from Twitter & Reddit." },
                            { icon: BarChart2, title: "Analytics", desc: "Deep dive into sentiment trends." },
                            { icon: Shield, title: "Secure", desc: "Enterprise-grade security & 2FA." }
                        ].map((feature, i) => (
                            <div key={i} className="p-6 rounded-2xl bg-light-50 border border-light-100 hover:border-brand-200 transition-colors">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-brand-600 mb-4">
                                    <feature.icon className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-lg text-light-900">{feature.title}</h3>
                                <p className="text-light-600 mt-2">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default Landing;