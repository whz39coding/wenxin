import { api } from './client';

/** 列出当前用户所有已完成 OCR 的典籍。 */
export function listExhibitionBooks<T>() {
    return api.get<T>('/exhibition/books');
}

/** 获取指定典籍的某页竹简数据。slips[0] 为第一简（最右侧）。 */
export function getExhibitionBookPage<T>(
    uploadId: number,
    page: number,
    slipsPerPage = 8,
    charsPerSlip = 16,
) {
    return api.get<T>(`/exhibition/books/${uploadId}`, {
        params: { page, slips_per_page: slipsPerPage, chars_per_slip: charsPerSlip },
    });
}

