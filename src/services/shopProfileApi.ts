import { ShopProfile, type ShopProfileUpdateBody } from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const shopProfileApi = {
  get: async () => ShopProfile.parse((await api.get('/api/settings/profile')).data),
  update: async (body: ShopProfileUpdateBody) =>
    ShopProfile.parse((await api.patch('/api/settings/profile', body)).data),
};
