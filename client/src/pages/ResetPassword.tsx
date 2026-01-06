import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, TrendingUp, Eye, EyeOff } from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // 1. Get Token from URL (?token=...&id=...)
    const token = searchParams.get('token');
    const userId = searchParams.get('id');

    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Validation: Missing Link Data
        if (!token || !userId) {
            setStatus('error');
            setMessage('Invalid or missing reset link. Please try again.');
            return;
        }

        // Validation: Password Strength
        if (newPassword.length < 8) {
            setStatus('error');
            setMessage('Password must be at least 8 characters long.');
            return;
        }

        setStatus('loading');

        try {
            await API.post('/reset-password', {
                userId,
                token,
                newPassword
            });
            setStatus('success');
            // Redirect after 3 seconds
            setTimeout(() => navigate('/login'), 3000);
        } catch (err) {
            setStatus('error');
            if (axios.isAxiosError(err) && err.response) {
                setMessage(err.response.data.msg || 'Failed to reset password.');
            } else {
                setMessage('Something went wrong. Please try again.');
            }
        }
    };

    return (
        <div className="min-h-screen flex w-full items-center justify-center p-6 bg-light-100 font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

            <div className="relative w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <TrendingUp className="w-8 h-8 text-brand-600" />
                        <h1 className="text-3xl font-display font-bold text-gradient">New Password</h1>
                    </div>
                    <p className="text-light-600 text-sm">Secure your account with a strong password</p>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-6 animate-slide-up">
                    {status === 'success' ? (
                        // Success View
                        <div className="text-center space-y-4 py-6">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto border-4 border-white shadow-sm">
                                <CheckCircle className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-semibold text-light-900">Password Updated!</h3>
                            <p className="text-light-600 text-sm">Redirecting you to login...</p>
                        </div>
                    ) : (
                        // Form View
                        <>
                            {status === 'error' && (
                                <div className="alert alert-error">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm font-medium">{message}</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="password" className="label">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />

                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="•••••••• (Min 8 chars)"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input pl-10 pr-10"
                                        minLength={8}
                                        required
                                    />

                                    {/* Toggle Visibility */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-light-400 hover:text-brand-600 focus:outline-none transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={status === 'loading'} className="btn btn-primary w-full">
                                {status === 'loading' ? 'Updating...' : 'Set New Password'}
                            </button>
                        </>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;