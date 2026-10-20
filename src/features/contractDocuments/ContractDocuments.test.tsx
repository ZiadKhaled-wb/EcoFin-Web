import { render, screen, within } from '@testing-library/react';
import {
  checkContractTemplate,
  sumMoney,
  amountInWordsAr,
  type ContractDocuments,
} from '@ziadkhaled-wb/contracts';
import { describe, expect, it } from 'vitest';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import ContractDocument from './ContractDocument';
import PromissoryNotes from './PromissoryNotes';
import { documentsFixture } from './fixture';
import { termsText } from './documentText';

const ar = (v: string) => formatMoney(v, 'ar');
const d = (v: string) => formatBusinessDate(v, 'ar');
const contract = (docs: ContractDocuments, copy = false) =>
  render(<ContractDocument docs={docs} copy={copy} logoUrl={null} />);

describe('N07 printed contract', () => {
  it('prints every schedule line, date and amount, and the terms of the contract', () => {
    const docs = documentsFixture();
    contract(docs);
    const rows = within(screen.getByTestId('contract-schedule')).getAllByRole('row');
    expect(rows).toHaveLength(1 + docs.contract.lines.length);
    docs.contract.lines.forEach((l, i) => {
      expect(rows[i + 1]).toHaveTextContent(d(l.due_date));
      expect(rows[i + 1]).toHaveTextContent(ar(l.amount));
    });
    const text = document.body.textContent ?? '';
    for (const v of [
      docs.contract.down_payment,
      docs.contract.financed_amount,
      docs.contract.markup_amount,
      docs.contract.total_payable,
    ]) {
      expect(text).toContain(ar(v));
    }
    expect(screen.getByTestId('installment-price')).toHaveTextContent(ar('12000.00'));
    expect(text).toContain(amountInWordsAr('12000.00'));
    expect(text).toContain('MAIN-CT-26-000007');
    expect(text).toContain(d('2026-10-16'));
  });

  it('shows the customer and the guarantor with their full national ID, job and address', () => {
    contract(documentsFixture());
    const text = document.body.textContent ?? '';
    for (const v of [
      '29001010100501',
      'مهندسة',
      '5 شارع النصر، القاهرة',
      '28501010100123',
      'مدرس',
      '3 شارع الجمهورية، الجيزة',
      'تلفزيون 55 بوصة',
      '123456',
    ]) {
      expect(text).toContain(v);
    }
  });

  it('is Arabic and right to left, with a signature block for every party', () => {
    const { container } = contract(documentsFixture());
    expect(container.querySelector('[dir="rtl"][lang="ar"]')).not.toBeNull();
    expect(screen.getByText('عقد بيع بالتقسيط')).toBeInTheDocument();
    expect(container.querySelectorAll('.cd-signatures .cd-sign')).toHaveLength(3);
  });

  it('states only the installment price, the word profit, and no interest, fee or discount wording', () => {
    contract(documentsFixture());
    const text = document.body.textContent ?? '';
    expect(checkContractTemplate(text).words).toEqual([]);
    expect(text).toContain('ربح البائع');
    expect(text).toContain('سعر البيع بالتقسيط');
    expect(text).not.toMatch(/interest|late fee|penalty|loan/i);
    expect(text).not.toContain('السعر النقدي');
  });

  it('marks a copy across the page and not an original', () => {
    const { unmount } = contract(documentsFixture(), false);
    expect(screen.queryByTestId('copy-mark')).toBeNull();
    unmount();
    contract(documentsFixture(), true);
    expect(screen.getByTestId('copy-mark')).toHaveTextContent('صورة (COPY)');
  });

  it('shows the status of a closed contract and what a rescheduled one replaces', () => {
    const { unmount } = contract(documentsFixture({ status_mark: 'written_off' }));
    expect(screen.getByTestId('status-mark')).toHaveTextContent('دين معدوم');
    unmount();
    contract(documentsFixture({ replaces: { version: 1, date: '2026-10-16' } }));
    expect(screen.getByTestId('replaces')).toHaveTextContent(d('2026-10-16'));
  });

  it('prints the own terms of the shop with the placeholders filled in, or the default text', () => {
    const own = documentsFixture({
      terms: {
        text: 'العميل {{customer_name}} يلتزم بسداد {{installment_price}}',
        is_default: false,
      },
    });
    expect(termsText(own)).toBe(`العميل منى عادل يلتزم بسداد ${ar('12000.00')}`);
    const def = termsText(documentsFixture());
    expect(def).not.toContain('{{');
    expect(def).toContain('شركة النور للتجارة');
    expect(def).toContain(amountInWordsAr('12000.00'));
    expect(checkContractTemplate(def).words).toEqual([]);
  });
});

describe('N07 promissory notes', () => {
  it('prints one note per installment: amount, due date, words, number; their sum is what is left', () => {
    const docs = documentsFixture();
    render(<PromissoryNotes docs={docs} copy={false} />);
    const notes = screen.getAllByTestId('promissory-note');
    expect(notes).toHaveLength(3);
    docs.notes.forEach((n, i) => {
      expect(notes[i]).toHaveTextContent(n.number);
      expect(notes[i]).toHaveTextContent(ar(n.amount));
      expect(notes[i]).toHaveTextContent(d(n.due_date));
      expect(notes[i]).toHaveTextContent(amountInWordsAr(n.amount));
    });
    expect(sumMoney(docs.notes.map((n) => n.amount))).toBe(docs.contract.balance.remaining);
  });

  it('names the drawer, the beneficiary, the place, the date of issue and every joint guarantor', () => {
    render(<PromissoryNotes docs={documentsFixture()} copy={false} />);
    const first = screen.getAllByTestId('promissory-note')[0]!;
    expect(first).toHaveTextContent('منى عادل');
    expect(first).toHaveTextContent('29001010100501');
    expect(first).toHaveTextContent('شركة النور للتجارة');
    expect(first).toHaveTextContent('حررت في القاهرة');
    expect(first).toHaveTextContent(d('2026-10-16'));
    expect(first).toHaveTextContent('ضامن متضامن');
    expect(first).toHaveTextContent('أحمد عادل');
    expect(first).toHaveTextContent('28501010100123');
  });

  it('prints a single note for what is left, due on the last installment', () => {
    const docs = documentsFixture({
      notes_mode: 'single',
      notes: [
        {
          number: 'MAIN-CT-26-000007-T',
          seq: null,
          amount: '12000.00',
          due_date: '2027-01-16',
          place: 'القاهرة',
          issue_date: '2026-10-16',
        },
      ],
    });
    render(<PromissoryNotes docs={docs} copy={false} />);
    const notes = screen.getAllByTestId('promissory-note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent('MAIN-CT-26-000007-T');
    expect(notes[0]).toHaveTextContent(ar('12000.00'));
    expect(notes[0]).toHaveTextContent(d('2027-01-16'));
  });

  it('says COPY on a copy, says what it replaces, and carries no forbidden wording', () => {
    render(
      <PromissoryNotes
        docs={documentsFixture({ replaces: { version: 1, date: '2026-10-16' } })}
        copy
      />,
    );
    expect(screen.getByTestId('copy-mark')).toHaveTextContent('COPY');
    expect(screen.getByTestId('replaces')).toBeInTheDocument();
    expect(checkContractTemplate(document.body.textContent ?? '').words).toEqual([]);
    expect(document.body.textContent).not.toMatch(/interest|fee|penalty/i);
  });
});
