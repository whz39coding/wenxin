import { api } from './client';

export function listUploads<T>() {
    return api.get<T>('/uploads');
}

export function listUnocrUploads<T>() {
    return api.get<T>('/uploads/unocr');
}

export function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
}

export function getUploadContent(uploadId: number) {
    return api.get(`/uploads/${uploadId}/content`, { responseType: 'blob' });
}
