import type {
  Product,
  PurchaseApproval,
  PurchaseInvoice,
  PurchaseReturn,
  ReturnableInvoice,
  TaxClass,
} from '@ziadkhaled-wb/contracts';

/** Test data shared by the purchase invoice page tests. */
export const MAIN = 'a0540000-0000-4000-8000-000000000011';
export const SUPPLIER = 'a0540000-0000-4000-8000-000000000001';
export const INVOICE = 'a0540000-0000-4000-8000-000000000020';
export const TV = 'a0540000-0000-4000-8000-000000000003';
export const CHAIR = 'a0540000-0000-4000-8000-000000000006';
export const PHONE = 'a0540000-0000-4000-8000-000000000004';
export const STD = 'a0540000-0000-4000-8000-000000000005';
export const EXEMPT = 'a0540000-0000-4000-8000-000000000007';
export const LINE_TV = 'a0540000-0000-4000-8000-000000000031';
export const LINE_PHONE = 'a0540000-0000-4000-8000-000000000032';
const ts = '2026-10-11T08:00:00.000Z';

export const taxClasses: TaxClass[] = [
  {
    id: STD,
    name: 'VAT 14%',
    kind: 'standard',
    rate: '14.00',
    eta_tax_type: 'T1',
    eta_subtype: 'V009',
    archived_at: null,
    updated_at: ts,
  },
  {
    id: EXEMPT,
    name: 'Exempt',
    kind: 'exempt',
    rate: '0.00',
    eta_tax_type: 'T1',
    eta_subtype: 'V003',
    archived_at: null,
    updated_at: ts,
  },
];

export const product = (over: Partial<Product> = {}): Product => ({
  id: TV,
  name_ar: 'تلفزيون',
  name_en: 'TV',
  sku: 'TV-55',
  barcode: '2000000000015',
  category_id: null,
  unit_of_measure: 'piece',
  cash_price: '200.00',
  installment_price: null,
  avg_cost: '0.0000',
  tax_class_id: STD,
  warranty_months: 0,
  is_serialized: false,
  min_stock: 0,
  image_file_id: null,
  eta_item_code: null,
  eta_item_type: null,
  archived_at: null,
  created_at: ts,
  updated_at: ts,
  ...over,
});

export const invoice = (over: Partial<PurchaseInvoice> = {}): PurchaseInvoice => ({
  id: INVOICE,
  number: 'MAIN-PI-26-000001',
  supplier_id: SUPPLIER,
  supplier_name: 'Nile Traders',
  branch_id: MAIN,
  supplier_invoice_no: 'S-100',
  invoice_date: '2026-10-10',
  status: 'draft',
  subtotal: '3100.00',
  tax_total: '434.00',
  total: '3534.00',
  outstanding: null,
  approved_by_name: null,
  approved_at: null,
  rejected_reason: null,
  created_by_name: 'Owner',
  created_at: ts,
  updated_at: ts,
  approval: null,
  lines: [
    {
      id: LINE_TV,
      product_id: TV,
      name_ar: 'تلفزيون',
      name_en: 'TV',
      sku: 'TV-55',
      is_serialized: false,
      quantity: 10,
      unit_cost: '130.00',
      tax_class_id: STD,
      tax_rate: '14.00',
      tax_amount: '182.00',
      net: '1300.00',
      line_total: '1482.00',
      serials: null,
      unit_ids: [],
    },
    {
      id: LINE_PHONE,
      product_id: PHONE,
      name_ar: 'موبايل',
      name_en: 'Phone',
      sku: 'PH-1',
      is_serialized: true,
      quantity: 2,
      unit_cost: '900.00',
      tax_class_id: STD,
      tax_rate: '14.00',
      tax_amount: '252.00',
      net: '1800.00',
      line_total: '2052.00',
      serials: null,
      unit_ids: [],
    },
  ],
  ...over,
});

export const summary = (over: Partial<PurchaseInvoice> = {}) => {
  const { lines, ...rest } = invoice(over);
  return { ...rest, lines_count: lines.length };
};

export const branches = [{ id: MAIN, code: 'B1', name: 'Main', is_main: true }];

/** U06: a waiting approval (12 000 above a 10 000 threshold), requested by a manager. */
export const approval = (over: Partial<PurchaseApproval> = {}): PurchaseApproval => ({
  id: 'a0540000-0000-4000-8000-000000000040',
  status: 'pending',
  amount: '3534.00',
  threshold: '1000.00',
  requested_by_name: 'Manager',
  requested_at: ts,
  decided_by_name: null,
  decided_at: null,
  note: null,
  ...over,
});

/** U04: an approved invoice where 4 of the 10 TVs already went back; both phones are in stock. */
export const RETURN = 'a0540000-0000-4000-8000-000000000050';
export const UNIT_1 = 'a0540000-0000-4000-8000-000000000061';
export const UNIT_2 = 'a0540000-0000-4000-8000-000000000062';
export const SAFE = 'a0540000-0000-4000-8000-000000000070';

export const purchaseReturn = (over: Partial<PurchaseReturn> = {}): PurchaseReturn => ({
  id: RETURN,
  number: 'MAIN-PR-26-000001',
  purchase_invoice_id: INVOICE,
  invoice_number: 'MAIN-PI-26-000001',
  supplier_id: SUPPLIER,
  supplier_name: 'Nile Traders',
  branch_id: MAIN,
  refund_mode: 'supplier_credit',
  cash_account_id: null,
  cash_account_name: null,
  subtotal: '520.00',
  tax_total: '72.80',
  total: '592.80',
  reason: 'Damaged on arrival',
  business_date: '2026-10-11',
  created_by_name: 'Owner',
  created_at: ts,
  lines: [
    {
      id: 'a0540000-0000-4000-8000-000000000051',
      invoice_line_id: LINE_TV,
      product_id: TV,
      name_ar: 'تلفزيون',
      name_en: 'TV',
      sku: 'TV-55',
      unit_id: null,
      serial: null,
      quantity: 4,
      unit_cost: '130.00',
      tax_amount: '72.80',
      net: '520.00',
      line_total: '592.80',
    },
  ],
  ...over,
});

export const returnSummary = (over: Partial<PurchaseReturn> = {}) => {
  const { lines, ...rest } = purchaseReturn(over);
  return { ...rest, lines_count: lines.length };
};

export const returnable = (): ReturnableInvoice => ({
  invoice: summary({ status: 'approved', outstanding: '2941.20' }),
  lines: [
    {
      invoice_line_id: LINE_TV,
      product_id: TV,
      name_ar: 'تلفزيون',
      name_en: 'TV',
      sku: 'TV-55',
      is_serialized: false,
      purchased: 10,
      returned: 4,
      returnable: 6,
      unit_cost: '130.00',
      units_in_stock: [],
    },
    {
      invoice_line_id: LINE_PHONE,
      product_id: PHONE,
      name_ar: 'موبايل',
      name_en: 'Phone',
      sku: 'PH-1',
      is_serialized: true,
      purchased: 2,
      returned: 0,
      returnable: 2,
      unit_cost: '900.00',
      units_in_stock: [
        { unit_id: UNIT_1, serial: 'SN-1' },
        { unit_id: UNIT_2, serial: 'SN-2' },
      ],
    },
  ],
});
