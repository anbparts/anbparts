const rawBackendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

export const API_PROXY_BASE = '/api';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ? API_PROXY_BASE : rawBackendUrl;
export const BACKEND_PUBLIC_URL = rawBackendUrl;
