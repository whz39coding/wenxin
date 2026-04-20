import axios from 'axios';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE_URL = configuredApiBase || '/api';

const TOKEN_KEY = 'lunyu_access_token';
const USER_KEY = 'lunyu_current_user';
export const AUTH_STATE_CHANGE_EVENT = 'lunyu-auth-state-change';
export const AUTH_REQUIRED_EVENT = 'lunyu-auth-required';
let pendingAuthRequiredMessage: string | null = null;

export type AuthUser = {
    id: number;
    username: string;
    email: string;
    created_at: string;
};

export const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 120000,
});

export function notifyAuthRequired(message?: string) {
    const normalizedMessage = message || '当前操作需要先登录，请先登录后再试。';
    pendingAuthRequiredMessage = normalizedMessage;
    window.dispatchEvent(
        new CustomEvent(AUTH_REQUIRED_EVENT, {
            detail: {
                message: normalizedMessage,
            },
        })
    );
}

export function consumePendingAuthRequiredMessage() {
    const message = pendingAuthRequiredMessage;
    pendingAuthRequiredMessage = null;
    return message;
}

// 请求拦截器：添加 token 和日志
api.interceptors.request.use((config) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // 在开发或调试时输出请求信息
    if (import.meta.env.DEV) {
        console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
            hasToken: !!token,
            baseURL: config.baseURL,
        });
    }
    return config;
});

// 响应拦截器：处理 401 和日志
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
                const requestUrl = error.config?.url || '';
                const isAuthPageRequest = /\/auth\/(login|register)/.test(requestUrl);
                console.warn('[API] Received 401 Unauthorized', {
                    url: error.config?.url,
                    message: error.response?.data?.detail,
                });
                if (!isAuthPageRequest) {
                    clearAuth();
                    notifyAuthRequired('登录状态已失效或尚未登录，请先登录后再继续操作。');
                }
            } else if (!error.response) {
                console.warn('[API] Network error or no response', {
                    url: error.config?.url,
                    message: error.message,
                });
            }
        }
        return Promise.reject(error);
    }
);

export function saveAuth(accessToken: string, user: AuthUser) {
    pendingAuthRequiredMessage = null;
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}

export function clearAuth() {
    pendingAuthRequiredMessage = null;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem('wenxin_theme_mode');
    document.documentElement.removeAttribute('data-theme');
    window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}

export function getStoredUser(): AuthUser | null {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

export function getStoredToken(): string | null {
    return window.localStorage.getItem(TOKEN_KEY);
}

export function updateStoredUser(nextUser: AuthUser) {
    const token = getStoredToken();
    if (!token) {
        return;
    }
    saveAuth(token, nextUser);
}
