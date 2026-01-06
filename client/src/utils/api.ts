import axios, { type InternalAxiosRequestConfig } from 'axios';

// FIX: Use relative URL to leverage Vite proxy (avoids CORS & ERR_INTERNET_DISCONNECTED)
const API = axios.create({
    baseURL: '/api/auth'
});

// Add types to the interceptor
API.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
        config.headers['x-auth-token'] = token;
    }
    return config;
});

export interface SentimentData {
    name: 'Positive' | 'Neutral' | 'Negative';
    value: number;
}

// New interface for the updated API response
export interface SentimentResponse {
    posts: SentimentData[];
    comments: SentimentData[];
    totals: {
        posts: number;
        comments: number;
        total: number;
    };
}

export type AnalysisStatus = 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export default API;