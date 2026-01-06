import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Mail, Shield, Smartphone, LogOut, CheckCircle, AlertCircle,
    TrendingUp, Edit2, Save, X, Lock, Eye, EyeOff
} from 'lucide-react';
import API from '../utils/api';
import axios from 'axios';
import Header from '../components/Header';

interface UserProfile {
    full_name: string;
    email: string;
    subscription_tier: string;
    is_2fa_enabled: boolean;
}

const Profile = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ type: '', text: '' });

    // --- EDIT PROFILE STATE ---
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');

    // --- PASSWORD CHANGE STATE ---
    const [passData, setPassData] = useState({ current: '', new: '' });
    const [passLoading, setPassLoading] = useState(false);
    const [showCurrentPass, setShowCurrentPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);

    // --- 2FA STATE ---
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [verifyCode, setVerifyCode] = useState('');

    // 1. Fetch Data
    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await API.get('/me');
            setUser(res.data.user);
            setEditName(res.data.user.full_name);
        } catch (err) {
            navigate('/login');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        navigate('/login');
    };

    // 2. Update Profile Logic (Name Only)
    const handleUpdateProfile = async () => {
        if (!editName.trim()) {
            setMessage({ type: 'error', text: 'Name cannot be empty' });
            return;
        }
        try {
            await API.put('/profile', { fullName: editName });
            setUser(prev => prev ? { ...prev, full_name: editName } : null);
            setIsEditing(false);
            setMessage({ type: 'success', text: 'Profile updated successfully' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to update profile' });
        }
    };

    // 3. Change Password Logic
    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();

        // Validation: Minimum Length
        if (passData.new.length < 8) {
            setMessage({ type: 'error', text: 'New password must be at least 8 characters' });
            return;
        }

        // Validation: Irregular Input (Basic Check)
        if (passData.new.includes(' ')) {
            setMessage({ type: 'error', text: 'Password cannot contain spaces' });
            return;
        }

        setPassLoading(true);
        try {
            await API.put('/change-password', {
                currentPassword: passData.current,
                newPassword: passData.new
            });
            setMessage({ type: 'success', text: 'Password changed successfully' });
            setPassData({ current: '', new: '' });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setMessage({ type: 'error', text: err.response.data.msg || 'Failed to change password' });
            }
        } finally {
            setPassLoading(false);
        }
    };

    // 4. 2FA Logic
    const start2FASetup = async () => {
        try {
            const res = await API.post('/2fa/setup');
            setQrCode(res.data.qrImage);
            setShow2FASetup(true);
            setMessage({ type: '', text: '' }); // Clear previous messages
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to initialize 2FA' });
        }
    };

    const verify2FA = async () => {
        try {
            await API.post('/2fa/verify', { token: verifyCode });
            setUser(prev => prev ? { ...prev, is_2fa_enabled: true } : null);
            setShow2FASetup(false);
            setMessage({ type: 'success', text: '2FA Enabled Successfully!' });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setMessage({ type: 'error', text: err.response.data.msg || 'Invalid 2FA Code' });
            }
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-brand-600 font-sans">Loading...</div>;

    return (
        <div>
            <Header />
            <div className="min-h-screen p-6 bg-light-100 font-sans mt-15">

                <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-light-100 to-accent-teal-light/5 pointer-events-none" />

                <div className="relative max-w-5xl mx-auto animate-fade-in">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-brand-600" />
                            <h1 className="text-2xl font-display font-bold text-light-900">Account Settings</h1>
                        </div>
                        <button onClick={handleLogout} className="btn bg-white border border-light-300 text-light-600 hover:bg-light-50 hover:text-accent-red-dark transition-colors shadow-sm">
                            <LogOut className="w-4 h-4 mr-2" /> Sign Out
                        </button>
                    </div>

                    {/* Notifications */}
                    {message.text && (
                        <div className={`mb-6 alert ${message.type === 'error' ? 'alert-error' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                            {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            <span>{message.text}</span>
                            <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto text-xs opacity-70 hover:opacity-100">Dismiss</button>
                        </div>
                    )}

                    <div className="grid md:grid-cols-3 gap-6">

                        {/* COLUMN 1: Profile Info */}
                        <div className="md:col-span-1 space-y-6">
                            <div className="card p-6 border-t-4 border-brand-600">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center text-brand-600 mb-4 shadow-inner border-4 border-white">
                                        <User className="w-12 h-12" />
                                    </div>

                                    {/* Editable Name */}
                                    {isEditing ? (
                                        <div className="w-full space-y-2 animate-fade-in">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="input text-center font-medium"
                                                autoFocus
                                            />
                                            <div className="flex justify-center gap-2">
                                                <button onClick={handleUpdateProfile} className="p-2 bg-brand-100 text-brand-700 rounded-full hover:bg-brand-200 transition-colors"><Save className="w-4 h-4" /></button>
                                                <button onClick={() => { setIsEditing(false); setEditName(user?.full_name || ''); }} className="p-2 bg-light-100 text-light-600 rounded-full hover:bg-light-200 transition-colors"><X className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="group relative">
                                            <h2 className="text-xl font-bold text-light-900">{user?.full_name}</h2>
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="absolute -right-8 top-1 text-light-400 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Edit Name"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}

                                    <span className="inline-block px-3 py-1 mt-2 text-xs font-bold tracking-wide uppercase bg-brand-50 text-brand-700 rounded-full border border-brand-100">
                                        {user?.subscription_tier} Member
                                    </span>
                                </div>

                                <div className="mt-6 pt-6 border-t border-light-200 space-y-4">
                                    <div className="flex items-center gap-3 text-sm text-light-600 bg-light-50 p-3 rounded-lg border border-light-100">
                                        <Mail className="w-4 h-4 text-light-400" />
                                        <span className="truncate flex-1">{user?.email}</span>
                                        <span title="Email cannot be changed" role="img" aria-label="Email cannot be changed">
                                            <Lock className="w-3 h-3 text-light-400" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 2 & 3: Security Settings */}
                        <div className="md:col-span-2 space-y-6">

                            {/* Password Management */}
                            <div className="card p-6">
                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-light-100">
                                    <div className="p-2 bg-light-100 rounded-lg text-light-600">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-light-900">Password Management</h3>
                                        <p className="text-xs text-light-500">Update your login credentials</p>
                                    </div>
                                </div>
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {/* Current Password */}
                                        <div className="space-y-1 relative">
                                            <label className="text-xs font-medium text-light-700">Current Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showCurrentPass ? "text" : "password"}
                                                    className="input pr-10"
                                                    placeholder="••••••••"
                                                    value={passData.current}
                                                    onChange={(e) => setPassData({ ...passData, current: e.target.value })}
                                                    required
                                                />
                                                <button type="button" onClick={() => setShowCurrentPass(!showCurrentPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-light-400 hover:text-brand-600">
                                                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* New Password */}
                                        <div className="space-y-1 relative">
                                            <label className="text-xs font-medium text-light-700">New Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showNewPass ? "text" : "password"}
                                                    className="input pr-10"
                                                    placeholder="Min 8 chars"
                                                    value={passData.new}
                                                    onChange={(e) => setPassData({ ...passData, new: e.target.value })}
                                                    minLength={8}
                                                    required
                                                />
                                                <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-light-400 hover:text-brand-600">
                                                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button type="submit" disabled={passLoading} className="btn bg-light-900 text-white hover:bg-light-800 shadow-md text-sm">
                                            {passLoading ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* 2FA Section */}
                            <div className="card p-6">
                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-light-100">
                                    <div className="p-2 bg-accent-teal-light/10 rounded-lg text-accent-teal-dark">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-light-900">Two-Factor Authentication</h3>
                                        <p className="text-xs text-light-500">Add an extra layer of security</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between bg-light-50 p-4 rounded-xl border border-light-200">
                                    <div className="flex gap-4 items-center">
                                        <div className={`p-3 rounded-full ${user?.is_2fa_enabled ? 'bg-green-100 text-green-600' : 'bg-light-200 text-light-400'}`}>
                                            <Smartphone className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-light-900">Authenticator App</h4>
                                            <p className="text-xs text-light-500">
                                                {user?.is_2fa_enabled ? "Active and securing your account." : "Not configured yet."}
                                            </p>
                                        </div>
                                    </div>

                                    {user?.is_2fa_enabled ? (
                                        <span className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wide rounded-full border border-green-200">
                                            <CheckCircle className="w-3 h-3" /> Enabled
                                        </span>
                                    ) : (
                                        !show2FASetup && (
                                            <button onClick={start2FASetup} className="btn btn-primary text-sm">
                                                Setup 2FA
                                            </button>
                                        )
                                    )}
                                </div>

                                {/* 2FA Wizard */}
                                {show2FASetup && (
                                    <div className="mt-6 p-6 bg-light-50 rounded-xl border border-light-200 animate-fade-in">
                                        <h5 className="font-bold text-light-900 mb-4">Configure Authenticator</h5>
                                        <div className="flex flex-col md:flex-row gap-8">
                                            <div className="bg-white p-2 rounded-lg shadow-sm border border-light-200 w-fit mx-auto md:mx-0">
                                                <img src={qrCode} alt="QR Code" className="w-32 h-32" />
                                            </div>
                                            <div className="flex-1 space-y-4">
                                                <ol className="list-decimal list-inside text-sm text-light-600 space-y-2">
                                                    <li>Open <strong>Google Authenticator</strong> on your phone.</li>
                                                    <li>Scan the QR image shown on the left.</li>
                                                    <li>Enter the 6-digit code below to verify.</li>
                                                </ol>
                                                <div className="flex gap-3 max-w-xs">
                                                    <input
                                                        type="text"
                                                        placeholder="123 456"
                                                        className="input text-center tracking-[0.5em] font-mono text-lg"
                                                        maxLength={6}
                                                        value={verifyCode}
                                                        onChange={(e) => setVerifyCode(e.target.value)}
                                                    />
                                                    <button onClick={verify2FA} className="btn btn-primary">Verify</button>
                                                </div>
                                                <button onClick={() => setShow2FASetup(false)} className="text-xs text-light-500 hover:text-accent-red-dark underline">Cancel Setup</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
};

export default Profile;