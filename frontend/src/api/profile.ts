import { api } from './client';

export type ProfileUploadItem = {
    id: number;
    filename: string;
    content_type: string;
    file_size: number;
    extracted_text?: string | null;
    has_extracted_text: boolean;
    created_at: string;
};

export type ProfileSummaryResponse = {
    username: string;
    email: string;
    total_uploads: number;
    uploads: ProfileUploadItem[];
};

export type ProfileUserSettings = {
    id: number;
    username: string;
    email: string;
    created_at: string;
};

export type SearchSettingsResponse = {
    api_key: string;
    has_api_key: boolean;
    model: string;
    base_url: string;
    answer_prompt: string;
    system_default_answer_prompt: string;
};

export type UpdateSearchSettingsPayload = {
    api_key?: string;
    model?: string;
    base_url?: string;
    answer_prompt?: string;
};

export type UISettingsResponse = {
    theme_mode: 'light' | 'night' | string;
    music_file_name?: string | null;
    music_url?: string | null;
};

export type UploadMusicResponse = {
    music_file_name: string;
    music_url: string;
};

export type UpdateProfileSettingsPayload = {
    username: string;
    email: string;
    current_password?: string;
    new_password?: string;
};

export function getProfileSummary() {
    return api.get<ProfileSummaryResponse>('/profile/summary');
}

export function listProfileUploads() {
    return api.get<ProfileUploadItem[]>('/profile/uploads');
}

export function getProfileUploadDetail(uploadId: number) {
    return api.get<ProfileUploadItem>(`/profile/uploads/${uploadId}`);
}

export function updateProfileUploadExtractedText(uploadId: number, extractedText: string) {
    return api.put<ProfileUploadItem>(`/profile/uploads/${uploadId}/extracted-text`, {
        extracted_text: extractedText,
    });
}

export function deleteProfileUpload(uploadId: number) {
    return api.delete<{ deleted: boolean }>(`/profile/uploads/${uploadId}`);
}

export function updateProfileSettings(payload: UpdateProfileSettingsPayload) {
    return api.put<ProfileUserSettings>('/profile/settings', payload);
}

export function getSearchSettings() {
    return api.get<SearchSettingsResponse>('/profile/search-settings');
}

export function updateSearchSettings(payload: UpdateSearchSettingsPayload) {
    return api.put<SearchSettingsResponse>('/profile/search-settings', payload);
}

export function getUISettings() {
    return api.get<UISettingsResponse>('/profile/ui-settings');
}

export function updateUISettings(themeMode: 'light' | 'night') {
    return api.put<UISettingsResponse>('/profile/ui-settings', { theme_mode: themeMode });
}

export function uploadBackgroundMusic(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.post<UploadMusicResponse>('/profile/ui-settings/music', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
}
