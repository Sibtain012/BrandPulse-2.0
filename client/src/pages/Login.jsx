import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, TrendingUp, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';
import OTPInput from '../components/OTPInput';

const Login = () => {
    const navigate = useNavigate();

    // --- STATE ---
    const [step, setStep] = useState('credentials');
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // --- HANDLERS ---
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await API.post('/login', formData);

            if (res.data.is2fa) {
                setStep('2fa');
                // Start 60-second cooldown immediately when 2FA OTP is sent
                setResendCooldown(60);
                setIsSubmitting(false);
                return;
            }

            if (res.data.requiresVerification) {
                setError('Please verify your email before logging in. Check your inbox for the verification code.');
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

    const handleVerify2FA = async (otp) => {
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await API.post('/login', { ...formData, token: otp });
            localStorage.setItem('accessToken', res.data.accessToken);
            localStorage.setItem('refreshToken', res.data.refreshToken);
            navigate('/', { replace: true });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Invalid OTP code');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOTP = async () => {
        if (resendCooldown > 0) return;

        setError(null);
        try {
            // Need to get a new OTP by re-logging in
            const res = await API.post('/login', formData);
            if (res.data.is2fa) {
                setResendCooldown(60); // 60-second cooldown
                setError(null);
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Failed to resend code');
            }
        }
    };

    // Cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

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
                                : 'Enter the 6-digit code sent to your email'}
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

                    {/* --- STEP 2: EMAIL OTP 2FA --- */}
                    {step === '2fa' && (
                        <div className="space-y-4 animate-fade-in">
                            {/* Email Notification */}
                            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <Mail className="w-5 h-5 text-brand-600 mt-0.5" />
                                    <div>
                                        <p className="text-brand-800 font-medium">📧 Check Your Email</p>
                                        <p className="text-sm text-brand-600 mt-1">
                                            We sent a 6-digit verification code to <strong>{formData.email}</strong>
                                        </p>
                                        <p className="text-xs text-blue-500 mt-2">
                                            The code will expire in 1 minute.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* OTP Input */}
                            <div>
                                <label className="block text-sm font-medium text-light-700 mb-3">
                                    Enter Verification Code
                                </label>
                                <OTPInput onComplete={handleVerify2FA} />
                            </div>

                            {/* Resend Button */}
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={resendCooldown > 0}
                                    className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:text-light-400 disabled:cursor-not-allowed"
                                >
                                    {resendCooldown > 0
                                        ? `Resend code in ${resendCooldown}s`
                                        : 'Resend verification code'}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setStep('credentials');
                                    setError(null);
                                }}
                                className="text-xs text-light-500 hover:text-brand-600 flex items-center gap-1 mx-auto"
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
