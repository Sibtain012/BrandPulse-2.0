import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, TrendingUp, ArrowRight, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';
import OTPInput from '../components/OTPInput';

const Register = () => {
    const navigate = useNavigate();

    // Step management
    const [step, setStep] = useState<'register' | 'verify'>('register');

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: ''
    });
    const [maskedEmail, setMaskedEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    // Step 1: Register
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await API.post('/register', formData);

            if (res.data.requiresVerification) {
                setMaskedEmail(res.data.email);
                setStep('verify');
                // Start 60-second cooldown immediately when OTP is sent
                setResendCooldown(60);
            } else {
                // Fallback: if no verification required
                localStorage.setItem('accessToken', res.data.token);
                navigate('/', { replace: true });
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Registration failed');
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Step 2: Verify OTP
    const handleVerifyOTP = async (otp: string) => {
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await API.post('/verify-registration', {
                email: formData.email,
                otp
            });

            localStorage.setItem('accessToken', res.data.token);
            navigate('/', { replace: true });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Verification failed');
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Resend OTP
    const handleResendOTP = async () => {
        if (resendCooldown > 0) return;

        setError(null);
        try {
            await API.post('/resend-registration-otp', { email: formData.email });
            setResendCooldown(60); // 60-second cooldown
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

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-light-100 font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

            <div className="relative w-full max-w-md animate-fade-in">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <TrendingUp className="w-8 h-8 text-brand-600" />
                        <h1 className="text-3xl font-display font-bold text-gradient">BrandPulse</h1>
                    </div>
                    <p className="text-light-600 text-sm">
                        {step === 'register'
                            ? 'Create your account to start tracking'
                            : 'Verify your email to continue'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-5 animate-slide-up">
                    {/* Step 1: Registration Form */}
                    {step === 'register' && (
                        <>
                            <div className="space-y-1">
                                <h2 className="text-2xl font-semibold text-light-900">Get Started</h2>
                                <p className="text-light-600 text-sm">Free enterprise-grade analytics account</p>
                            </div>

                            {error && (
                                <div className="alert alert-error animate-fade-in">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm font-medium">{error}</span>
                                </div>
                            )}

                            {/* Full Name */}
                            <div className="space-y-2">
                                <label htmlFor="fullName" className="label">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                                    <input
                                        id="fullName"
                                        type="text"
                                        placeholder="John Doe"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        className="input pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="space-y-2">
                                <label htmlFor="email" className="label">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="john@company.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="input pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-2">
                                <label htmlFor="password" className="label">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="•••••••• (Min 8 chars)"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="input pl-10 pr-10"
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-light-400 hover:text-brand-600 focus:outline-none transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full group">
                                {isSubmitting ? 'Creating Account...' : (
                                    <span className="flex items-center gap-2">
                                        Create Account <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </button>
                        </>
                    )}

                    {/* Step 2: OTP Verification */}
                    {step === 'verify' && (
                        <div className="space-y-5 animate-fade-in">
                            <div className="space-y-1">
                                <h2 className="text-2xl font-semibold text-light-900">Verify Your Email</h2>
                                <p className="text-light-600 text-sm">We sent a 6-digit code to <strong>{maskedEmail}</strong></p>
                            </div>

                            {error && (
                                <div className="alert alert-error animate-fade-in">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm font-medium">{error}</span>
                                </div>
                            )}

                            {/* Email Notification */}
                            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <Mail className="w-5 h-5 text-brand-600 mt-0.5" />
                                    <div>
                                        <p className="text-brand-800 font-medium">📧 Check Your Email</p>
                                        <p className="text-sm text-brand-600 mt-1">
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
                                <OTPInput onComplete={handleVerifyOTP} />
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

                            {/* Back Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    setStep('register');
                                    setError(null);
                                }}
                                className="text-xs text-light-500 hover:text-brand-600 flex items-center gap-1 mx-auto"
                            >
                                <ArrowLeft className="w-3 h-3" /> Back to registration
                            </button>
                        </div>
                    )}

                    {step === 'register' && (
                        <div className="text-center text-sm pt-2">
                            <span className="text-light-600">Already have an account? </span>
                            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
                                Sign in
                            </Link>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Register;