import { api } from './client';

export function getPortalOverview<T>() {
    return api.get<T>('/portal/overview');
}
