import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, TrendingUp, ArrowRight } from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';

const Register = () => {
    const navigate = useNavigate();

    // --- LOGIC SECTION ---
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.id]: e.target.value
        });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await API.post('/register', formData);

            // Auto-login after register
            localStorage.setItem('accessToken', res.data.token);
            navigate('/dashboard', { replace: true });

        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.msg || 'Registration failed');
            } else {
                setError('Unable to register. Please check your connection.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- UI SECTION (Matched to Login.tsx) ---
    return (
        <div className="min-h-screen flex w-full items-center justify-center p-6 bg-light-100 font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

            <div className="relative w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <TrendingUp className="w-8 h-8 text-brand-600" />
                        <h1 className="text-3xl font-display font-bold text-gradient">BrandPulse</h1>
                    </div>
                    <p className="text-light-600 text-sm">Create your account to start tracking</p>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} className="card p-8 space-y-6 animate-slide-up">
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-light-900">Get Started</h2>
                        <p className="text-light-600 text-sm">Free enterprise-grade analytics account</p>
                    </div>

                    {error && (
                        <div className="alert alert-error">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    )}

                    {/* Full Name Input */}
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

                    {/* Email Input */}
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

                    {/* Password Input */}
                    <div className="space-y-2">
                        <label htmlFor="password" className="label">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                            <input
                                id="password"
                                type="password"
                                placeholder="•••••••• (Min 8 chars)"
                                value={formData.password}
                                onChange={handleChange}
                                className="input pl-10"
                                minLength={8}
                                required
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full group">
                        {isSubmitting ? 'Creating Account...' : (
                            <span className="flex items-center gap-2">
                                Create Account <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </span>
                        )}
                    </button>

                    <div className="text-center text-sm pt-2">
                        <span className="text-light-600">Already have an account? </span>
                        <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
                            Sign in
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Register;