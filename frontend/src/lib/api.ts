import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'lunyu_access_token';
const USER_KEY = 'lunyu_current_user';

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  created_at: string;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function saveAuth(accessToken: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
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
