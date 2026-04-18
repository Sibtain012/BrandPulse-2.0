import axios from 'axios';

const API = axios.create({
    baseURL: '/api/auth'
});

API.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
        config.headers['x-auth-token'] = token;
    }
    return config;
});

// Mutex: prevents multiple simultaneous refresh calls across concurrent requests.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
    failedQueue = [];
};

API.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Another request already started a refresh — queue this one.
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
                originalRequest.headers['x-auth-token'] = token;
                return API(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            return Promise.reject(error);
        }

        try {
            const { data } = await axios.post('/api/auth/refresh', { refreshToken });
            localStorage.setItem('accessToken', data.accessToken);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            processQueue(null, data.accessToken);
            originalRequest.headers['x-auth-token'] = data.accessToken;
            return API(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default API;
