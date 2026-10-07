import {
  FileResponse,
  FileUrlResponse,
  InstallmentPolicy,
  InstallmentPolicyList,
  ShopSettings,
  type InstallmentPolicyBody,
  type ShopSettingsUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** P03. Replaces FinTech-Pro's settingsAPI (get/update/reset of one config_data blob). */
export const settingsApi = {
  get: async () => ShopSettings.parse((await api.get('/api/settings')).data),
  /** Sends only the fields of one tab; returns the full settings after the change. */
  update: async (body: ShopSettingsUpdateBody) =>
    ShopSettings.parse((await api.patch('/api/settings', body)).data),
  policies: async () =>
    InstallmentPolicyList.parse((await api.get('/api/settings/installment-policies')).data),
  publishPolicy: async (body: InstallmentPolicyBody) =>
    InstallmentPolicy.parse((await api.post('/api/settings/installment-policies', body)).data),
  /** Short-lived signed link to show the logo. */
  logoUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
  /** F14 upload with purpose "logo"; the returned id goes into logo_file_id. */
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append('purpose', 'logo');
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
};
