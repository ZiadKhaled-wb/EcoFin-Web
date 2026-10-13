import {
  CurrentDeviceResponse,
  Device,
  DeviceActiveResult,
  DeviceCreated,
  DevicePaired,
  DevicePairingCode,
  DeviceUnpaired,
  type DeviceActiveBody,
  type DeviceCreateBody,
  type DeviceUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const deviceKeys = {
  /** The device this computer is paired with, for the stored token. */
  current: (orgId: string | null, token: string | null) =>
    ['devices', orgId, 'current', token] as const,
};

/**
 * O03 POS devices (D68): managing the shop's devices and pairing a computer with one. The list
 * and the ETA registration stay in etaApi (T02). A pairing code and a device token are each
 * answered once: the code is shown and dropped, the token goes to localStorage (deviceToken).
 */
export const devicesApi = {
  create: async (body: DeviceCreateBody) =>
    DeviceCreated.parse((await api.post('/api/devices', body)).data),
  update: async (id: string, body: DeviceUpdateBody) =>
    Device.parse((await api.patch(`/api/devices/${id}`, body)).data),
  setActive: async (id: string, body: DeviceActiveBody) =>
    DeviceActiveResult.parse((await api.post(`/api/devices/${id}/active`, body)).data),
  pairingCode: async (id: string) =>
    DevicePairingCode.parse((await api.post(`/api/devices/${id}/pairing-code`)).data),
  unpair: async (id: string) =>
    DeviceUnpaired.parse((await api.post(`/api/devices/${id}/unpair`)).data),
  pair: async (code: string) =>
    DevicePaired.parse((await api.post('/api/devices/pair', { code })).data),
  current: async () =>
    CurrentDeviceResponse.parse((await api.get('/api/devices/current')).data).device,
};
