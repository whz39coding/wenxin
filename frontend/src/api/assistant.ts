import { api } from './client';

export function askAssistant<T>(payload: { page: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }) {
    return api.post<T>('/assistant/chat', payload);
}
