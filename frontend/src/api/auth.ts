import { api } from './client';
import type { AuthUser } from './client';

export function login(payload: { identifier: string; password: string }) {
    return api.post('/auth/login', payload);
}

export function register(payload: { username: string; email: string; password: string }) {
    return api.post('/auth/register', payload);
}

export function me() {
    return api.get<AuthUser>('/auth/me');
}
