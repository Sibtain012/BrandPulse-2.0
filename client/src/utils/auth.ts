// Utility to decode JWT and extract user information
// This prevents hardcoding user IDs and gets the actual logged-in user

interface DecodedToken {
    userId?: number;
    user_id?: number;
    id?: number;
    email?: string;
    exp?: number;
    iat?: number;
    [key: string]: any; // Allow any additional fields
}

/**
 * Decodes a JWT token and extracts the payload
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export const decodeToken = (token: string): DecodedToken | null => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        console.log('🔍 Decoded JWT token:', decoded); // Debug log
        return decoded;
    } catch (error) {
        console.error('Failed to decode token:', error);
        return null;
    }
};

/**
 * Gets the current logged-in user's ID from localStorage JWT token
 * Supports multiple field names: userId, user_id, id
 * @returns User ID or null if not logged in
 */
export const getCurrentUserId = (): number | null => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        console.warn('⚠️ No accessToken found in localStorage');
        return null;
    }

    const decoded = decodeToken(token);
    if (!decoded) {
        console.warn('⚠️ Failed to decode token');
        return null;
    }

    // Try different possible field names for user ID
    const userId = decoded.userId || decoded.user_id || decoded.id;

    if (!userId) {
        console.error('❌ No user ID found in token. Token payload:', decoded);
        return null;
    }

    console.log('✅ Found user ID:', userId);
    return Number(userId);
};

/**
 * Gets the current logged-in user's email from localStorage JWT token
 * @returns User email or null if not logged in
 */
export const getCurrentUserEmail = (): string | null => {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    const decoded = decodeToken(token);
    return decoded?.email || null;
};

/**
 * Checks if the current token is expired
 * @returns true if expired or invalid, false otherwise
 */
export const isTokenExpired = (): boolean => {
    const token = localStorage.getItem('accessToken');
    if (!token) return true;

    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    // Check if token expiration time (in seconds) is less than current time
    return decoded.exp * 1000 < Date.now();
};
