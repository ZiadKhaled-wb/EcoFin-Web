import {
  StockAdjustment,
  StockAdjustmentList,
  StockCount,
  StockCountDetail,
  StockCountLine,
  StockCountList,
  StockList,
  StockMovementList,
  StockTransfer,
  StockTransferList,
  TransferDestinationList,
  type AdjustmentReason,
  type StockAdjustmentCreateBody,
  type StockCountCreateBody,
  type StockCountLineBody,
  type StockCountLineFilter,
  type StockCountStatus,
  type StockTransferCreateBody,
  type StockTransferReceiveLine,
  type StockTransferUpdateBody,
  type TransferStatus,
} from '@ziadkhaled-wb/contracts';
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
export interface AdjustmentListParams {
  branch_id?: string;
  reason?: AdjustmentReason;
  page?: number;
  pageSize?: number;
}
export interface CountListParams {
  branch_id?: string;
  status?: StockCountStatus;
  page?: number;
  pageSize?: number;
}
export interface TransferListParams {
  branch_id?: string;
  status?: TransferStatus;
  page?: number;
  pageSize?: number;
}
export interface CountDetailParams {
  filter?: StockCountLineFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}

const flag = (v: boolean | undefined) => (v === undefined ? undefined : String(v));
/** Stock writes are idempotent: the same key twice changes things once (F10). */
const idempotent = (key: string) => ({ headers: { 'Idempotency-Key': key } });

export const stockKeys = {
  all: (orgId: string | null) => ['stock', orgId] as const,
  list: (orgId: string | null, params: StockListParams) =>
    ['stock', orgId, 'list', params] as const,
  movements: (orgId: string | null, params: StockMovementsParams) =>
    ['stock', orgId, 'movements', params] as const,
  adjustments: (orgId: string | null, params: AdjustmentListParams) =>
    ['stock', orgId, 'adjustments', params] as const,
  adjustment: (orgId: string | null, id: string) => ['stock', orgId, 'adjustment', id] as const,
  counts: (orgId: string | null, params: CountListParams) =>
    ['stock', orgId, 'counts', params] as const,
  count: (orgId: string | null, id: string) => ['stock', orgId, 'count', id] as const,
  countLines: (orgId: string | null, id: string, params: CountDetailParams) =>
    ['stock', orgId, 'count', id, params] as const,
  transfers: (orgId: string | null, params: TransferListParams) =>
    ['stock', orgId, 'transfers', params] as const,
  transfer: (orgId: string | null, id: string) => ['stock', orgId, 'transfer', id] as const,
  destinations: (orgId: string | null) => ['stock', orgId, 'transfer-destinations'] as const,
};

/** I01 stock view (stock.view) and I02 adjustments and counts; only the caller's branches. */
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

  adjustments: async (params: AdjustmentListParams = {}) =>
    StockAdjustmentList.parse((await api.get('/api/stock/adjustments', { params })).data),
  adjustment: async (id: string) =>
    StockAdjustment.parse((await api.get(`/api/stock/adjustments/${id}`)).data),
  /** stock.adjust; the key is kept per form, so a retried submit posts once. */
  postAdjustment: async (body: StockAdjustmentCreateBody, key: string) =>
    StockAdjustment.parse((await api.post('/api/stock/adjustments', body, idempotent(key))).data),

  counts: async (params: CountListParams = {}) =>
    StockCountList.parse((await api.get('/api/stock/counts', { params })).data),
  createCount: async (body: StockCountCreateBody, key: string) =>
    StockCount.parse((await api.post('/api/stock/counts', body, idempotent(key))).data),
  count: async (id: string, params: CountDetailParams = {}) =>
    StockCountDetail.parse((await api.get(`/api/stock/counts/${id}`, { params })).data),
  saveCountLines: async (id: string, lines: StockCountLineBody[]) =>
    StockCount.parse((await api.put(`/api/stock/counts/${id}/lines`, { lines })).data),
  /** A serial counts its unit; a barcode or SKU adds one to the product's line. */
  scan: async (id: string, code: string) =>
    StockCountLine.parse((await api.post(`/api/stock/counts/${id}/scan`, { code })).data),
  postCount: async (id: string, uncountedAsZero: boolean, key: string) =>
    StockCount.parse(
      (
        await api.post(
          `/api/stock/counts/${id}/post`,
          { uncounted_as_zero: uncountedAsZero },
          idempotent(key),
        )
      ).data,
    ),
  cancelCount: async (id: string) =>
    StockCount.parse((await api.post(`/api/stock/counts/${id}/cancel`)).data),

  /** I03 transfers: read with stock.view; draft / send / cancel with stock.transfer_send. */
  transfers: async (params: TransferListParams = {}) =>
    StockTransferList.parse((await api.get('/api/stock/transfers', { params })).data),
  transfer: async (id: string) =>
    StockTransfer.parse((await api.get(`/api/stock/transfers/${id}`)).data),
  /** Every active branch of the shop (a sender works in some, sends to any). */
  transferDestinations: async () =>
    TransferDestinationList.parse((await api.get('/api/stock/transfers/destinations')).data),
  createTransfer: async (body: StockTransferCreateBody, key: string) =>
    StockTransfer.parse((await api.post('/api/stock/transfers', body, idempotent(key))).data),
  updateTransfer: async (id: string, body: StockTransferUpdateBody) =>
    StockTransfer.parse((await api.put(`/api/stock/transfers/${id}`, body)).data),
  /** State changes: a repeat answers the transfer as it is and moves nothing again. */
  sendTransfer: async (id: string) =>
    StockTransfer.parse((await api.post(`/api/stock/transfers/${id}/send`)).data),
  cancelTransfer: async (id: string) =>
    StockTransfer.parse((await api.post(`/api/stock/transfers/${id}/cancel`)).data),
  /** Only the lines that did not arrive in full. */
  receiveTransfer: async (id: string, lines: StockTransferReceiveLine[]) =>
    StockTransfer.parse((await api.post(`/api/stock/transfers/${id}/receive`, { lines })).data),
};
