import {
  Category,
  CategoryList,
  type CategoryArchiveBody,
  type CategoryCreateBody,
  type CategoryUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const categoryKeys = { list: (orgId: string | null) => ['categories', orgId] as const };
export const categoriesApi = {
  list: async () => CategoryList.parse((await api.get('/api/categories')).data),
  create: async (body: CategoryCreateBody) =>
    Category.parse((await api.post('/api/categories', body)).data),
  update: async (id: string, body: CategoryUpdateBody) =>
    Category.parse((await api.patch(`/api/categories/${id}`, body)).data),
  archive: async (id: string, body: CategoryArchiveBody = {}) =>
    Category.parse((await api.post(`/api/categories/${id}/archive`, body)).data),
  restore: async (id: string) =>
    Category.parse((await api.post(`/api/categories/${id}/restore`)).data),
};
