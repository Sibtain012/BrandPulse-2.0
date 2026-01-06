import { TrendingUp, Twitter, Linkedin, Github, Facebook } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer className="bg-light-900 text-light-300 py-16 border-t border-light-800">
            <div className="max-w-7xl mx-auto px-6">

                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    {/* Brand Column */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-white">
                            <TrendingUp className="w-6 h-6 text-brand-400" />
                            <span className="text-xl font-display font-bold">BrandPulse</span>
                        </div>
                        <p className="text-sm text-light-400 leading-relaxed">
                            Enterprise-grade sentiment analysis and brand intelligence platform for modern businesses.
                        </p>
                        <div className="flex gap-4 pt-2">
                            <a href="#" className="hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
                            <a href="#" className="hover:text-white transition-colors"><Linkedin className="w-5 h-5" /></a>
                            <a href="#" className="hover:text-white transition-colors"><Github className="w-5 h-5" /></a>
                            <a href="#" className="hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
                        </div>
                    </div>

                    {/* Links Columns */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Product</h4>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Features</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Sentiment Analysis</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Crisis Detection</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Pricing</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-4">Company</h4>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#" className="hover:text-brand-400 transition-colors">About Us</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Careers</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Blog</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Contact</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-4">Legal</h4>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Privacy Policy</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Terms of Service</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Cookie Policy</a></li>
                            <li><a href="#" className="hover:text-brand-400 transition-colors">Security</a></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-light-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-light-500">
                    <p>© 2025 BrandPulse Inc. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link to="/login" className="hover:text-white">Admin Login</Link>
                        <a href="#" className="hover:text-white">System Status</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;