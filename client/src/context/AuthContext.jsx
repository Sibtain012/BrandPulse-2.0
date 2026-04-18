import { createContext, useContext, useState, useEffect } from 'react';
import { isTokenValid } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(() => isTokenValid());

    // Cross-tab sync: storage event only fires in tabs OTHER than the one that changed.
    // When Tab A logs in/out, Tab B's storage listener updates isAuthenticated,
    // which causes GuestRoute/ProtectedRoute to re-render and redirect automatically.
    useEffect(() => {
        const handleStorage = (e) => {
            if (e.key === 'accessToken') {
                setIsAuthenticated(isTokenValid());
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const login = (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        setIsAuthenticated(true);
    };

    const logout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};
