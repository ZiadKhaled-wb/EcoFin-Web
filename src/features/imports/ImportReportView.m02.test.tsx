import { screen } from '@testing-library/react';
import type { ImportJob } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import ImportReportView from './ImportReportView';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a2000000-0000-4000-8000-000000000001';

const job = (overdue: string): ImportJob => ({
  id: ID,
  kind: 'opening_contracts',
  status: 'validated',
  file_id: ID,
  file_name: 'open.xlsx',
  result_file_id: null,
  branch_id: null,
  rows_total: 6,
  rows_ok: 6,
  rows_failed: 0,
  created_at: '2026-10-22T10:00:00.000000+00:00',
  finished_at: null,
  created_by: { id: ID, name: 'Owner' },
  report: {
    columns: { mapping: {}, unmapped_headers: [] },
    sheet: null,
    branch_id: null,
    warnings: [
      {
        code: 'IMPORT_NOTE',
        column: null,
        message:
          'Fees in the old records are not imported: only what is left of the installment price is',
      },
    ],
    errors: [],
    errors_total: 0,
    errors_truncated: false,
    actions: { create: 2, update: 0, unchanged: 0 },
    preview: [],
    will_create_categories: [],
    applied: null,
    failure: null,
    summary: {
      contracts: 2,
      lines: 6,
      open_total: '7000.00',
      overdue_total: overdue,
      overdue_contracts: Number(overdue) > 0 ? 1 : 0,
      new_guarantors: 1,
    },
    contracts: [
      {
        row: 2,
        contract_ref: 'K-100',
        customer: 'Amal Ahmed',
        lines: 4,
        open_total: '4000.00',
        overdue_total: '0.00',
        overdue_days: 0,
        new_guarantors: 1,
      },
      {
        row: 6,
        contract_ref: 'K-103',
        customer: 'Cairo Customer',
        lines: 2,
        open_total: '3000.00',
        overdue_total: overdue,
        overdue_days: 40,
        new_guarantors: 0,
      },
    ],
  },
});

describe('M02 dry run: the contracts of the file', () => {
  beforeEach(() => signIn());
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'lists each contract with what is left and what is late, and says the nightly check will react (%s)',
    async (lang) => {
      await renderApp(<ImportReportView job={job('1500.00')} />, { lang });
      expect(await screen.findByText('K-100')).toBeInTheDocument();
      expect(screen.getByText('Cairo Customer')).toBeInTheDocument();
      expect(screen.getByText(t('imports.wizard.review.contracts.feesNote'))).toBeInTheDocument();
      // The late amount appears in the table row and in the notice.
      expect(screen.getAllByText(/1,500\.00/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/40/)).toBeInTheDocument();
    },
  );

  it('no late notice when nothing is late', async () => {
    const { container } = await renderApp(<ImportReportView job={job('0.00')} />, { lang: 'en' });
    await screen.findByText('K-100');
    expect(container.querySelector('.notice')).toBeNull();
  });
});
