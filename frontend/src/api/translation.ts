import { api } from './client';

export function listTranslationChapters<T>() {
    return api.get<T>('/translation/chapters');
}

export function getTranslationChapter<T>(chapterId: string) {
    return api.get<T>(`/translation/chapters/${chapterId}`);
}

export function getVariant<T>(word: string) {
    return api.get<T>(`/variants/${encodeURIComponent(word)}`);
}
