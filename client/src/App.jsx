import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Registration';
import Profile from './pages/Profile';
import Landing from './pages/Landing';
import SentimentAnalysis from './pages/SentimentAnalysis';
import ComplaintAnalyzer from './pages/ComplaintAnalyzer';
import IntentClassifier from './pages/IntentClassifier';
import History from './pages/History';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Routes - Require Authentication */}
        <Route path="/sentiment-analysis" element={
          <ProtectedRoute>
            <SentimentAnalysis />
          </ProtectedRoute>
        } />

        <Route path="/complaint-analyzer" element={
          <ProtectedRoute>
            <ComplaintAnalyzer />
          </ProtectedRoute>
        } />

        <Route path="/intent-classifier" element={
          <ProtectedRoute>
            <IntentClassifier />
          </ProtectedRoute>
        } />

        <Route path="/history" element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />

        {/* Default Redirect */}
        <Route path="/" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;
