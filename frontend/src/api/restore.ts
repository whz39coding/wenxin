import { api } from './client';

export function restoreText<T>(text: string) {
    return api.post<T>('/restore', { text });
}
