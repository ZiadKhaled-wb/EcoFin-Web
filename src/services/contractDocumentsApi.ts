import {
  ContractDocumentPrint,
  ContractDocuments,
  type ContractDocumentKind,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/**
 * N07 (D82). The data of the printed contract and promissory notes, and the print log. The read
 * carries full national IDs: it is never cached beyond the open print view (see the page's query).
 */
export const contractDocumentsApi = {
  get: async (id: string) =>
    ContractDocuments.parse((await api.get(`/api/contracts/${id}/documents`)).data),
  /** The server numbers each press of Print: the first of a schedule version is the original. */
  recordPrint: async (id: string, document: ContractDocumentKind) =>
    ContractDocumentPrint.parse(
      (await api.post(`/api/contracts/${id}/document-prints`, { document })).data,
    ),
};
