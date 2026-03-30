import { api } from './client';

export function listCommunityNotes<T>() {
    return api.get<T>('/community/notes');
}

export function createCommunityNote(payload: { title: string; chapter: string; content: string }) {
    return api.post('/community/notes', payload);
}

export function reactCommunityNote<T>(noteId: number, kind: 'like' | 'favorite') {
    return api.post<T>(`/community/notes/${noteId}/${kind}`);
}
