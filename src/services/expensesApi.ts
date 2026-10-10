import {
  Expense,
  ExpenseCategory,
  ExpenseCategoryList,
  ExpenseList,
  ExpenseReport,
  FileResponse,
  FileUrlResponse,
  type ExpenseCreateInput,
  type ExpenseReverseBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the expenses page asks for (business dates, YYYY-MM-DD). */
export interface ExpenseListParams {
  branch_id?: string;
  category_id?: string;
  from?: string;
  to?: string;
  include_reversals?: boolean;
  page?: number;
  pageSize?: number;
}
export interface ExpenseReportParams {
  from: string;
  to: string;
  branch_id?: string;
}

export const expenseKeys = {
  all: (orgId: string | null) => ['expenses', orgId] as const,
  list: (orgId: string | null, params: ExpenseListParams) =>
    ['expenses', orgId, 'list', params] as const,
  report: (orgId: string | null, params: ExpenseReportParams) =>
    ['expenses', orgId, 'report', params] as const,
  categories: (orgId: string | null, includeArchived: boolean) =>
    ['expenses', orgId, 'categories', includeArchived] as const,
};

const idempotent = (key: string) => ({ headers: { 'Idempotency-Key': key } });

/** K03 expenses (D61): categories, an expense from a vault or the open shift, owner reversal. */
export const expensesApi = {
  categories: async (includeArchived = false) =>
    ExpenseCategoryList.parse(
      (await api.get('/api/expense-categories', { params: { include_archived: includeArchived } }))
        .data,
    ),
  createCategory: async (name: string) =>
    ExpenseCategory.parse((await api.post('/api/expense-categories', { name })).data),
  renameCategory: async (id: string, name: string) =>
    ExpenseCategory.parse((await api.patch(`/api/expense-categories/${id}`, { name })).data),
  archiveCategory: async (id: string) =>
    ExpenseCategory.parse((await api.post(`/api/expense-categories/${id}/archive`)).data),
  restoreCategory: async (id: string) =>
    ExpenseCategory.parse((await api.post(`/api/expense-categories/${id}/restore`)).data),
  list: async (params: ExpenseListParams = {}) =>
    ExpenseList.parse((await api.get('/api/expenses', { params })).data),
  report: async (params: ExpenseReportParams) =>
    ExpenseReport.parse((await api.get('/api/expenses/report', { params })).data),
  /** `key` is made once per dialog: a second click records the same expense, not a new one. */
  create: async (body: ExpenseCreateInput, key: string) =>
    Expense.parse((await api.post('/api/expenses', body, idempotent(key))).data),
  /** Owner only. `key` is made once per dialog. */
  reverse: async (id: string, body: ExpenseReverseBody, key: string) =>
    Expense.parse((await api.post(`/api/expenses/${id}/reverse`, body, idempotent(key))).data),
  /** F14 upload with purpose "expense_receipt"; the returned id goes into receipt_file_id. */
  uploadReceipt: async (file: File) => {
    const form = new FormData();
    form.append('purpose', 'expense_receipt');
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
  /** Short-lived signed link to open the receipt (needs cash.view). */
  receiptUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
