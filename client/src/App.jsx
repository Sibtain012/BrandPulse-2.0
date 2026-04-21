import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Registration';
import Profile from './pages/Profile';
import Landing from './pages/Landing';
import SentimentAnalysis from './pages/SentimentAnalysis';
import IntentAnalysis from './pages/IntentAnalysis';
import History from './pages/History';

function App() {
    return (
        <Router>
            <AuthProvider>
                <Routes>
                    {/* Public */}
                    <Route path="/" element={<Landing />} />

                    {/* Guest Routes — authenticated users are redirected to / */}
                    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
                    <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
                    <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
                    <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />

                    {/* Protected Routes — unauthenticated users are redirected to /login */}
                    <Route path="/sentiment-analysis" element={<ProtectedRoute><SentimentAnalysis /></ProtectedRoute>} />
                    <Route path="/intent-analysis" element={<ProtectedRoute><IntentAnalysis /></ProtectedRoute>} />
                    <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;
