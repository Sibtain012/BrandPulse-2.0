import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, TrendingUp, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react'; // Added Eye/EyeOff
import API from '../utils/api';
import axios from 'axios';

const Login = () => {
    const navigate = useNavigate();

    // --- STATE ---
    const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [twoFaCode, setTwoFaCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // NEW: Password Visibility State
    const [showPassword, setShowPassword] = useState(false);

    // --- HANDLERS ---
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const payload = step === '2fa' ? { ...formData, token: twoFaCode } : formData;
            const res = await API.post('/login', payload);

            if (res.data.is2fa) {
                setStep('2fa');
                setIsSubmitting(false);
                return;
            }

            localStorage.setItem('accessToken', res.data.accessToken);
            localStorage.setItem('refreshToken', res.data.refreshToken);
            navigate('/', { replace: true });

        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Invalid credentials');
            } else {
                setError('Unable to sign in. Please check your connection.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- UI RENDER ---
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-light-100 font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

            <div className="relative w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <TrendingUp className="w-8 h-8 text-brand-600" />
                        <h1 className="text-3xl font-display font-bold text-gradient">BrandPulse</h1>
                    </div>
                    <p className="text-light-600 text-sm">Real-time sentiment analysis & brand intelligence</p>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-6 animate-slide-up">

                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-light-900">
                            {step === 'credentials' ? 'Welcome Back' : 'Two-Factor Authentication'}
                        </h2>
                        <p className="text-light-600 text-sm">
                            {step === 'credentials'
                                ? 'Sign in to access your analytics dashboard'
                                : 'Enter the 6-digit code from your authenticator app'}
                        </p>
                    </div>

                    {error && (
                        <div className="alert alert-error animate-fade-in">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    )}

                    {/* --- STEP 1: EMAIL & PASSWORD --- */}
                    {step === 'credentials' && (
                        <>
                            <div className="space-y-2">
                                <label htmlFor="email" className="label">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="input pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="password" className="label">Password</label>
                                    <Link to="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
                                        Forgot password?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />

                                    {/* Password Input with Toggle Logic */}
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"} // Dynamic Type
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="input pl-10 pr-10" // Added pr-10 so text doesn't hide behind icon
                                        required
                                    />

                                    {/* Toggle Button */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-light-400 hover:text-brand-600 focus:outline-none transition-colors"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-5 h-5" />
                                        ) : (
                                            <Eye className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- STEP 2: 2FA CODE --- */}
                    {step === '2fa' && (
                        <div className="space-y-2 animate-fade-in">
                            <label htmlFor="code" className="label">Authenticator Code</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-600" />
                                <input
                                    id="code"
                                    type="text"
                                    placeholder="123 456"
                                    value={twoFaCode}
                                    onChange={(e) => setTwoFaCode(e.target.value)}
                                    className="input pl-10 text-lg tracking-widest font-mono"
                                    maxLength={6}
                                    autoFocus
                                    required
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('credentials')}
                                className="text-xs text-light-500 hover:text-brand-600 flex items-center gap-1 mt-2"
                            >
                                <ArrowLeft className="w-3 h-3" /> Back to login
                            </button>
                        </div>
                    )}

                    <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full">
                        {isSubmitting ? 'Verifying...' : (step === 'credentials' ? 'Sign In' : 'Verify Code')}
                    </button>

                    {step === 'credentials' && (
                        <div className="text-center text-sm pt-2">
                            <span className="text-light-600">Don't have an account? </span>
                            <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
                                Create one now
                            </Link>
                        </div>
                    )}
                </form>

                <p className="text-center text-xs text-light-500 mt-8">
                    Protected by BrandPulse security
                </p>
            </div>
        </div>
    );
};

export default Login;