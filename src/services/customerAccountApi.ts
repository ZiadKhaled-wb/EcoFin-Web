import {
  CustomerAccount,
  CustomerContractSchedule,
  CustomerStatement,
  CustomerStatementQuery,
  FileListResponse,
  type FileResponse,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const customerAccountKeys = {
  /** Under the customer, so the customer page's own invalidation covers every account read. */
  account: (orgId: string | null, customerId: string) =>
    ['customers', orgId, 'account', customerId] as const,
  schedule: (orgId: string | null, customerId: string, contractId: string) =>
    ['customers', orgId, 'account', customerId, 'contracts', contractId, 'schedule'] as const,
  statement: (orgId: string | null, customerId: string, query: CustomerStatementQuery) =>
    [
      'customers',
      orgId,
      'account',
      customerId,
      'statement',
      query.from ?? '',
      query.to ?? '',
    ] as const,
  documents: (orgId: string | null, customerId: string) =>
    ['customers', orgId, 'account', customerId, 'documents'] as const,
};

/** A file with the record it belongs to (the customer, or one of their contracts by number). */
export interface AccountDocument {
  file: FileResponse;
  contractNumber: string | null;
}

/**
 * R02 customer account (D74). Read only; the server computes every number (open balance, fees,
 * overdue, the statement's running balance) and this module only fetches and parses it.
 */
export const customerAccountApi = {
  account: async (customerId: string) =>
    CustomerAccount.parse((await api.get(`/api/customers/${customerId}/account`)).data),
  schedule: async (customerId: string, contractId: string) =>
    CustomerContractSchedule.parse(
      (await api.get(`/api/customers/${customerId}/contracts/${contractId}/schedule`)).data,
    ),
  /** Both dates are optional; without them the whole history. */
  statement: async (customerId: string, query: CustomerStatementQuery) =>
    CustomerStatement.parse(
      (
        await api.get(`/api/customers/${customerId}/statement`, {
          params: CustomerStatementQuery.parse(query),
        })
      ).data,
    ),
  /**
   * F14 files on the customer and on each of their contracts. The server lists only the purposes
   * the caller may read, so a user without customer.view_pii doesn't see the ID photos.
   */
  documents: async (
    customerId: string,
    contracts: { id: string; number: string }[],
  ): Promise<AccountDocument[]> => {
    const list = async (entityType: 'customer' | 'contract', entityId: string) =>
      FileListResponse.parse(
        (await api.get('/api/files', { params: { entityType, entityId } })).data,
      ).items;
    const [own, ...perContract] = await Promise.all([
      list('customer', customerId),
      ...contracts.map((c) => list('contract', c.id)),
    ]);
    return [
      ...(own ?? []).map((file) => ({ file, contractNumber: null })),
      ...perContract.flatMap((files, i) =>
        files.map((file) => ({ file, contractNumber: contracts[i]?.number ?? null })),
      ),
    ];
  },
};
