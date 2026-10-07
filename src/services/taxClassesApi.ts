import {
  TaxClass,
  TaxClassList,
  type TaxClassCreateBody,
  type TaxClassUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const taxClassKeys = {
  list: (orgId: string | null) => ['tax-classes', orgId] as const,
};

/** T01 tax classes: everyone reads them; changes need catalog.manage. */
export const taxClassesApi = {
  list: async () => TaxClassList.parse((await api.get('/api/tax-classes')).data),
  create: async (body: TaxClassCreateBody) =>
    TaxClass.parse((await api.post('/api/tax-classes', body)).data),
  update: async (id: string, body: TaxClassUpdateBody) =>
    TaxClass.parse((await api.patch(`/api/tax-classes/${id}`, body)).data),
  archive: async (id: string) =>
    TaxClass.parse((await api.post(`/api/tax-classes/${id}/archive`)).data),
  restore: async (id: string) =>
    TaxClass.parse((await api.post(`/api/tax-classes/${id}/restore`)).data),
};
