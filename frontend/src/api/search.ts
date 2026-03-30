import { api } from './client';

export function searchClassics<T>(query: string) {
    return api.post<T>('/search', { query });
}
