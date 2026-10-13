import {
  Device,
  DeviceList,
  EtaSettings,
  EtaTestResult,
  type DeviceEtaBody,
  type EtaSettingsBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const etaKeys = {
  settings: (orgId: string | null) => ['eta', orgId, 'settings'] as const,
  devices: (orgId: string | null) => ['eta', orgId, 'devices'] as const,
};

/**
 * T02 ETA e-receipts (D67): the shop's ETA connection and each POS's registration. Secrets are
 * write-only: the server answers only whether one is stored (`has_client_secret`,
 * `has_preshared_key`). A sale's receipt comes with the sale itself (`Sale.eta`, salesApi).
 */
export const etaApi = {
  settings: async () => EtaSettings.parse((await api.get('/api/eta/settings')).data),
  /** Without `client_secret` the stored secret is kept. */
  saveSettings: async (body: EtaSettingsBody) =>
    EtaSettings.parse((await api.put('/api/eta/settings', body)).data),
  /** Logs one POS in at the ETA with the stored credentials. */
  test: async (deviceId: string) =>
    EtaTestResult.parse((await api.post('/api/eta/settings/test', { device_id: deviceId })).data),
  devices: async () => DeviceList.parse((await api.get('/api/devices')).data),
  /** Without `preshared_key` the stored key is kept. */
  saveDevice: async (id: string, body: DeviceEtaBody) =>
    Device.parse((await api.put(`/api/devices/${id}/eta`, body)).data),
};
