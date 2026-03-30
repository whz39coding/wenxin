import { api } from './client';

export function recognizeUpload<T>(uploadId: number) {
    return api.post<T>(`/ocr/${uploadId}`);
}
