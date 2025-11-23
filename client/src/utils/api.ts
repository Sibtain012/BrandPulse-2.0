import axios, { InternalAxiosRequestConfig } from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:3000/api/auth'
});

// Add types to the interceptor
API.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
        config.headers['x-auth-token'] = token;
    }
    return config;
});

export default API;