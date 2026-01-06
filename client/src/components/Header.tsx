import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, Menu, X, ChevronRight, User, LogOut, Settings, History as HistoryIcon } from 'lucide-react';

const Header = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const navigate = useNavigate();

    // Check if user is logged in
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setIsLoggedIn(!!token);
    }, []);

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Handle logout
    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setIsLoggedIn(false);
        setIsProfileMenuOpen(false);
        navigate('/login');
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/80 backdrop-blur-md shadow-sm py-4' : 'bg-transparent py-6'
                }`}
        >
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">

                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 group">
                    <div className="bg-brand-600 text-white p-2 rounded-lg group-hover:bg-brand-700 transition-colors">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <span className="text-xl font-display font-bold text-light-900 tracking-tight">
                        BrandPulse
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-light-600">
                    <a href="#features" className="hover:text-brand-600 transition-colors">Features</a>
                    <a href="#solutions" className="hover:text-brand-600 transition-colors">Solutions</a>
                    <a href="#pricing" className="hover:text-brand-600 transition-colors">Pricing</a>
                    <a href="#resources" className="hover:text-brand-600 transition-colors">Resources</a>
                </nav>

                {/* Desktop Auth Buttons / Profile Dropdown */}
                <div className="hidden md:flex items-center gap-4">
                    {isLoggedIn ? (
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-light-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center">
                                    <User className="w-5 h-5" />
                                </div>
                                <ChevronRight className={`w-4 h-4 text-light-600 transition-transform ${isProfileMenuOpen ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-light-200 py-2 animate-fade-in">
                                    <Link
                                        to="/history"
                                        className="flex items-center gap-3 px-4 py-2 text-sm text-light-700 hover:bg-light-50 transition-colors"
                                        onClick={() => setIsProfileMenuOpen(false)}
                                    >
                                        <HistoryIcon className="w-4 h-4" />
                                        Analysis History
                                    </Link>
                                    <Link
                                        to="/profile"
                                        className="flex items-center gap-3 px-4 py-2 text-sm text-light-700 hover:bg-light-50 transition-colors"
                                        onClick={() => setIsProfileMenuOpen(false)}
                                    >
                                        <Settings className="w-4 h-4" />
                                        Profile Settings
                                    </Link>
                                    <hr className="my-2 border-light-200" />
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <Link to="/login" className="text-sm font-medium text-light-600 hover:text-brand-600 transition-colors">
                                Sign In
                            </Link>
                            <Link to="/register" className="btn btn-primary text-sm group">
                                Get Started <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden text-light-600 hover:text-brand-600"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-light-200 shadow-lg p-6 animate-fade-in">
                    <nav className="flex flex-col gap-4 text-center">
                        <a href="#features" className="text-light-600 py-2">Features</a>
                        <a href="#solutions" className="text-light-600 py-2">Solutions</a>
                        <a href="#pricing" className="text-light-600 py-2">Pricing</a>
                        <hr className="border-light-200" />
                        {isLoggedIn ? (
                            <>
                                <Link
                                    to="/history"
                                    className="text-light-900 font-medium py-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Analysis History
                                </Link>
                                <Link
                                    to="/profile"
                                    className="text-light-900 font-medium py-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Profile Settings
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="text-red-600 font-medium py-2"
                                >
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="text-light-900 font-medium py-2">Sign In</Link>
                                <Link to="/register" className="btn btn-primary w-full justify-center">Get Started</Link>
                            </>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
};

export default Header;