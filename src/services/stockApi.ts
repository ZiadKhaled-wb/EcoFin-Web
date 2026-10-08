import { StockList, StockMovementList } from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the stock page asks for; flags are sent as 'true' / 'false' query strings. */
export interface StockListParams {
  branch_id?: string;
  category_id?: string;
  include_subcategories?: boolean;
  search?: string;
  low_only?: boolean;
  page?: number;
  pageSize?: number;
}
export interface StockMovementsParams {
  product_id: string;
  branch_id?: string;
  page?: number;
  pageSize?: number;
}

const flag = (v: boolean | undefined) => (v === undefined ? undefined : String(v));

export const stockKeys = {
  all: (orgId: string | null) => ['stock', orgId] as const,
  list: (orgId: string | null, params: StockListParams) =>
    ['stock', orgId, 'list', params] as const,
  movements: (orgId: string | null, params: StockMovementsParams) =>
    ['stock', orgId, 'movements', params] as const,
};

/** I01 stock view (stock.view); only the caller's branches come back. */
export const stockApi = {
  list: async ({ include_subcategories, low_only, ...rest }: StockListParams = {}) =>
    StockList.parse(
      (
        await api.get('/api/stock', {
          params: {
            ...rest,
            include_subcategories: flag(include_subcategories),
            low_only: flag(low_only),
          },
        })
      ).data,
    ),
  /** The drill-down: a product's ledger movements, newest first, with the running balance. */
  movements: async (params: StockMovementsParams) =>
    StockMovementList.parse((await api.get('/api/stock/movements', { params })).data),
};
