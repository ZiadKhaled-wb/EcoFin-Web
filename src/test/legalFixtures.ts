import type { LegalCaseDetail, LegalCaseRow } from '@ziadkhaled-wb/contracts';

export const CASE_ID = 'a1010000-0000-4000-8000-0000000000a1';
export const CONTRACT_ID = 'a1010000-0000-4000-8000-0000000000b1';
export const CUSTOMER_ID = 'a1010000-0000-4000-8000-0000000000c1';
export const LAWYER_ID = 'a1010000-0000-4000-8000-0000000000d1';
export const BRANCH_ID = 'a1010000-0000-4000-8000-0000000000e1';
export const HEARING_ID = 'a1010000-0000-4000-8000-0000000000f1';

export const legalRow = (over: Partial<LegalCaseRow> = {}): LegalCaseRow => ({
  id: CASE_ID,
  number: 'MAIN-LC-26-000001',
  case_number: '123/2026',
  court: 'Cairo Economic Court',
  case_type: 'Civil',
  status: 'preparing',
  opened_on: '2026-10-24',
  next_hearing_date: null,
  claim_amount: '11000.00',
  remaining: '10500.00',
  contract: { id: CONTRACT_ID, number: 'MAIN-CT-26-000001', branch_id: BRANCH_ID },
  customer: { id: CUSTOMER_ID, name: 'Bassem Ban', phone: '01011110003', status: 'blocked' },
  lawyer: { id: LAWYER_ID, name: 'Lawyer One' },
  ...over,
});

export const legalDetail = (over: Partial<LegalCaseDetail> = {}): LegalCaseDetail => ({
  ...legalRow(),
  guarantors: [{ id: 'a1010000-0000-4000-8000-0000000000a9', name: 'Ahmed Adel', relation: null }],
  hearings: [],
  notes: [
    {
      id: 'a1010000-0000-4000-8000-0000000000a8',
      note: 'First note',
      created_at: '2026-10-24T08:00:00.000Z',
      created_by_name: 'Owner',
    },
  ],
  amounts: {
    claim_amount: '11000.00',
    total_payable: '14000.00',
    paid_before_case: '1000.00',
    paid_since_opened: '500.00',
    remaining: '10500.00',
  },
  collections_since_opened: [
    {
      receipt_id: 'a1010000-0000-4000-8000-0000000000a7',
      number: 'MAIN-PY-26-000007',
      date: '2026-10-25',
      amount: '500.00',
      taken_by: 'Cashier One',
    },
  ],
  referral: null,
  outcome_kind: null,
  outcome: null,
  closed_at: null,
  created_by_name: 'Owner',
  ...over,
});
