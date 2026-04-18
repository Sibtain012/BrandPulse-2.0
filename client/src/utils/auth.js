/**
 * Decodes a JWT token and extracts the payload
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export const decodeToken = (token) => {
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
export const getCurrentUserId = () => {
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

    const userId = decoded.userId || decoded.user_id || decoded.id;

    if (!userId) {
        return null;
    }

    return Number(userId);
};

/**
 * Returns true if accessToken exists in localStorage and is not expired.
 */
export const isTokenValid = () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return false;
    const decoded = decodeToken(token);
    if (!decoded) return false;
    if (!decoded.exp) return true; // no expiry claim → treat as valid
    return decoded.exp * 1000 > Date.now();
};
