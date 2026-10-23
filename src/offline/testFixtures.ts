import type { OfflineSnapshotProduct } from '@ziadkhaled-wb/contracts';
import type { OfflineDb } from './db';
import { emptyCounters } from './sale';
import type { LeaseRecord, SnapshotRecord } from './types';

/** S08 W tests: a lease, a snapshot and products as the server would send them. */
export const IDS = {
  lease: '0b8a2f00-0000-4000-8000-000000000001',
  device: '0b8a2f00-0000-4000-8000-000000000002',
  shift: '0b8a2f00-0000-4000-8000-000000000003',
  branch: '0b8a2f00-0000-4000-8000-000000000004',
  cashier: '0b8a2f00-0000-4000-8000-000000000005',
  snapshot: '0b8a2f00-0000-4000-8000-000000000006',
  key: '0b8a2f00-0000-4000-8000-000000000007',
  taxClass: '0b8a2f00-0000-4000-8000-000000000008',
  chair: '0b8a2f00-0000-4000-8000-000000000011',
  phone: '0b8a2f00-0000-4000-8000-000000000012',
  noCode: '0b8a2f00-0000-4000-8000-000000000013',
  unit1: '0b8a2f00-0000-4000-8000-000000000021',
  unit2: '0b8a2f00-0000-4000-8000-000000000022',
} as const;

export const NOW = Date.parse('2026-10-20T10:00:00Z');

export function product(over: Partial<OfflineSnapshotProduct> = {}): OfflineSnapshotProduct {
  return {
    id: IDS.chair,
    name_ar: 'كرسي',
    name_en: 'Chair',
    sku: 'CH-1',
    barcodes: ['6221000000011'],
    price: '114.00',
    tax_class_id: IDS.taxClass,
    tax_rate: '14.00',
    eta_tax_type: 'T1',
    eta_subtype: 'V009',
    eta_item_code: 'EG-1-CH',
    eta_item_type: 'EGS',
    unit_type: 'EA',
    is_serialized: false,
    on_hand: 5,
    units: [],
    offline_sellable: true,
    reason: null,
    ...over,
  };
}

export const PHONE = product({
  id: IDS.phone,
  name_ar: 'هاتف',
  name_en: 'Phone',
  sku: 'PH-1',
  barcodes: [],
  price: '1140.00',
  is_serialized: true,
  on_hand: null,
  units: [
    { unit_id: IDS.unit1, serial: 'IMEI-1' },
    { unit_id: IDS.unit2, serial: 'IMEI-2' },
  ],
});

export const NO_CODE = product({
  id: IDS.noCode,
  name_ar: 'بدون كود',
  name_en: 'No code',
  sku: 'NC-1',
  barcodes: [],
  eta_item_code: null,
  offline_sellable: false,
  reason: 'NO_ETA_CODE',
});

export function leaseRecord(
  over: {
    limits?: Partial<LeaseRecord['lease']['limits']>;
    eta?: boolean;
    persisted?: boolean;
    expiresAt?: string;
    offsetMs?: number;
  } = {},
): LeaseRecord {
  return {
    lease: {
      id: IDS.lease,
      device_id: IDS.device,
      shift_id: IDS.shift,
      branch_id: IDS.branch,
      cashier_id: IDS.cashier,
      issued_at: new Date(NOW - 3_600_000).toISOString(),
      expires_at: over.expiresAt ?? new Date(NOW + 11 * 3_600_000).toISOString(),
      limits: {
        max_sale_total: '20000.00',
        max_hours: 12,
        max_sales: 100,
        max_lease_total: '200000.00',
        ...over.limits,
      },
      snapshot_id: IDS.snapshot,
      snapshot_hash: 'a'.repeat(64),
      chain_head: '',
      next_seq: 1,
      key_id: IDS.key,
    },
    offline_code: 'D1',
    eta: {
      enabled: over.eta ?? true,
      environment: 'preprod',
      portal_url: 'https://preprod.invoicing.eta.gov.eg',
      seller: {
        rin: '123456789',
        name: 'Shop One',
        activity_code: '4772',
        branch_code: '0',
        governorate: 'Cairo',
        city: 'Nasr City',
        street: 'Street 1',
        building_number: '1',
      },
      device_serial: 'POS-1',
    },
    offsetMs: over.offsetMs ?? 0,
    persisted: over.persisted ?? true,
    shop: null,
  };
}

export const snapshotRecord = (
  products: OfflineSnapshotProduct[] = [product(), PHONE, NO_CODE],
): SnapshotRecord => ({
  hash: 'a'.repeat(64),
  data: { branch_id: IDS.branch, prices_include_vat: true, eta_enabled: true, products },
});

/** Puts a lease, its snapshot and fresh counters in `db`, as refreshLease would. */
export async function seed(db: OfflineDb, lease = leaseRecord(), snapshot = snapshotRecord()) {
  await db.transaction(['lease', 'snapshot', 'counters'], 'readwrite', (tx) => {
    tx.put('lease', 'current', lease);
    tx.put('snapshot', 'current', snapshot);
    tx.put('counters', 'device', emptyCounters(lease.lease.id));
    return Promise.resolve();
  });
  return { lease, snapshot };
}
