import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

// Define the shape of the Props
interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;