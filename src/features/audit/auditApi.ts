import { AuditSearchResponse, type AuditSearchQuery } from '@ziadkhaled-wb/contracts';
import { api, ApiError } from '@/lib/api';

/** Filters the screen sends; page and pageSize always, the rest only when set. */
export type AuditSearchParams = Partial<Omit<AuditSearchQuery, 'page' | 'pageSize'>> & {
  page: number;
  pageSize: number;
};

export const auditApi = {
  /** GET /api/audit (F07, needs audit.view). A reply outside the contract is an error. */
  search: async (params: AuditSearchParams): Promise<AuditSearchResponse> => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
    );
    const res = await api.get<unknown>('/api/audit', { params: query });
    const parsed = AuditSearchResponse.safeParse(res.data);
    if (!parsed.success) throw new ApiError(500, 'UNKNOWN', 'Reply does not match the contract');
    return parsed.data;
  },
};
