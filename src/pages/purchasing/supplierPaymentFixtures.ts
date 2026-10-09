import type { OpenSupplierInvoiceList, SupplierPayment } from '@ziadkhaled-wb/contracts';
import { INVOICE, MAIN, SAFE, SUPPLIER } from './purchaseFixtures';

/** Test data shared by the supplier payment page tests. */
export const PAYMENT = 'a0580000-0000-4000-8000-000000000020';
export const REVERSAL = 'a0580000-0000-4000-8000-000000000021';
export const INVOICE_B = 'a0580000-0000-4000-8000-000000000022';

export const payment = (over: Partial<SupplierPayment> = {}): SupplierPayment => ({
  id: PAYMENT,
  number: 'MAIN-SP-26-000001',
  supplier_id: SUPPLIER,
  supplier_name: 'Nile Traders',
  branch_id: MAIN,
  cash_account_id: SAFE,
  cash_account_name: 'Main safe',
  amount: '3000.00',
  reference: 'TRX-1',
  business_date: '2026-10-11',
  paid_at: '2026-10-11T08:00:00.000Z',
  reverses_payment_id: null,
  reversed_by_payment_id: null,
  reason: null,
  created_by_name: 'Owner',
  allocations: [
    { purchase_invoice_id: INVOICE, invoice_number: 'MAIN-PI-26-000001', amount: '3000.00' },
  ],
  ...over,
});

export const paymentSummary = (over: Partial<SupplierPayment> = {}) => {
  const { allocations, ...rest } = payment(over);
  void allocations;
  return rest;
};

/** Two open invoices: the older one owes 8 400.00 (overdue), the newer one 5 700.00. */
export const openInvoices = (): OpenSupplierInvoiceList => ({
  items: [
    {
      purchase_invoice_id: INVOICE,
      number: 'MAIN-PI-26-000001',
      supplier_invoice_no: 'S-100',
      branch_id: MAIN,
      invoice_date: '2026-10-01',
      due_date: '2026-10-08',
      overdue: true,
      total: '11400.00',
      paid: '3000.00',
      returned_credit: '0.00',
      outstanding: '8400.00',
    },
    {
      purchase_invoice_id: INVOICE_B,
      number: 'MAIN-PI-26-000002',
      supplier_invoice_no: null,
      branch_id: MAIN,
      invoice_date: '2026-10-06',
      due_date: '2026-10-13',
      overdue: false,
      total: '5700.00',
      paid: '0.00',
      returned_credit: '0.00',
      outstanding: '5700.00',
    },
  ],
  total_outstanding: '14100.00',
});
