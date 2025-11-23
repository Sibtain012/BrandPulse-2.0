import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Registration'; // Create this similarly to Login
// import Dashboard from '../pages/Dashboard'; // Create this simple component

// Placeholder Dashboard for testing
const Dashboard = () => <h1>Welcome to BrandPulse Dashboard</h1>;
// const Register = () => <h1>Register Page (TODO)</h1>;

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;