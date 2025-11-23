import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setStatus('loading');

        try {
            await API.post('/forgot-password', { email });
            setStatus('success');
            setMessage('Reset link sent! Please check your inbox.');
        } catch (err) {
            setStatus('error');
            if (axios.isAxiosError(err) && err.response) {
                setMessage(err.response.data.msg || 'Failed to send link.');
            } else {
                setMessage('Network error. Please try again.');
            }
        }
    };

    return (
        <div className="min-h-screen flex w-full items-center justify-center p-6 bg-light-100 font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

            <div className="relative w-full max-w-md animate-fade-in">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <TrendingUp className="w-8 h-8 text-brand-600" />
                        <h1 className="text-3xl font-display font-bold text-gradient">Reset Password</h1>
                    </div>
                    <p className="text-light-600 text-sm">Enter your email to receive a recovery link</p>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-6 animate-slide-up">
                    {status === 'success' ? (
                        <div className="flex flex-col items-center text-center space-y-4 py-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-medium text-light-900">Check your email</h3>
                                <p className="text-light-600 text-sm">{message}</p>
                            </div>
                            <Link to="/login" className="btn btn-primary w-full mt-4">Return to Login</Link>
                        </div>
                    ) : (
                        <>
                            {status === 'error' && (
                                <div className="alert alert-error">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm font-medium">{message}</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="email" className="label">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-400" />
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="input pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={status === 'loading'} className="btn btn-primary w-full">
                                {status === 'loading' ? 'Sending Link...' : 'Send Reset Link'}
                            </button>

                            <div className="text-center pt-2">
                                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-light-600 hover:text-brand-600 transition-colors">
                                    <ArrowLeft className="w-4 h-4" /> Back to Login
                                </Link>
                            </div>
                        </>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ForgotPassword;