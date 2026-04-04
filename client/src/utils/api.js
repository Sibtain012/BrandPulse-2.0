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

export default API;
