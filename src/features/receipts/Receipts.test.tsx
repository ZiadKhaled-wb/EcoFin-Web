import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import type { Sale, ShopSettings } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@/lib/format';
import { branchApi } from '@/services/branchApi';
import { salesApi } from '@/services/salesApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { settingsApi } from '@/services/settingsApi';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import { t, type Language } from '@/i18n';
import PrintReceipt from './PrintReceipt';
import QrCode from './QrCode';
import SaleReceipt, { type SaleReceiptProps } from './SaleReceipt';
import { QR_QUIET_ZONE, qrMatrix } from './qr';
import { receiptPageCss } from './receiptPrefs';
import { ETA_POLL, type ReceiptSale } from './receiptRules';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const id = (n: number) => `a0440000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MAIN = id(1);
const UUID = 'b'.repeat(64);
const QR =
  'https://preprod.invoicing.eta.gov.eg/receipts/search/' +
  `${UUID}/share/2026-10-13T09:15:02Z#Total:1026.00,IssuerRIN:674859545`;
const PREFS_KEY = 'ecofin.receipt.prefs';

const line = (n: number, over: Partial<Sale['lines'][number]> = {}): Sale['lines'][number] => ({
  id: id(100 + n),
  line_no: n,
  product_id: id(200 + n),
  name_ar: `كرسي ${n}`,
  name_en: `Chair ${n}`,
  sku: `CH-${n}`,
  is_serialized: false,
  unit_id: null,
  serial: null,
  quantity: 2,
  unit_price: '250.00',
  tax_rate: '14.00',
  tax_amount: '58.33',
  line_total: '475.00',
  discount_amount: '25.00',
  warranty_until: null,
  ...over,
});

const sale = (over: Partial<ReceiptSale> = {}): ReceiptSale => ({
  id: id(2),
  number: 'MAIN-SL-26-000042',
  branch_id: MAIN,
  shift_id: id(3),
  shift_number: 'MAIN-SH-26-000007',
  customer_id: id(4),
  customer_name: 'Mona Adel',
  prices_include_vat: true,
  subtotal: '1296.49',
  discount_total: '25.00',
  discount_reason: 'Loyal customer',
  tax_total: '181.51',
  total: '1478.00',
  business_date: '2026-10-13',
  issued_at: '2026-10-13T09:15:02.000Z',
  created_by_name: 'Omar Cashier',
  lines: [
    line(1),
    line(2, {
      name_ar: 'هاتف',
      name_en: 'Phone',
      sku: 'PH-1',
      is_serialized: true,
      unit_id: id(5),
      serial: '356938035643809',
      quantity: 1,
      unit_price: '1003.00',
      tax_amount: '123.18',
      line_total: '1003.00',
      discount_amount: '0.00',
      warranty_until: '2027-10-13',
    }),
  ],
  payments: [
    {
      id: id(6),
      number: 'MAIN-PY-26-000050',
      method: 'cash',
      amount: '978.00',
      cash_account_id: id(7),
      cash_account_name: 'Drawer 1',
      reference: null,
      tendered: '1000.00',
      change: '22.00',
    },
    {
      id: id(8),
      number: 'MAIN-PY-26-000051',
      method: 'bank_transfer',
      amount: '500.00',
      cash_account_id: id(9),
      cash_account_name: 'NBE',
      reference: 'TRX-7781',
      tendered: null,
      change: null,
    },
  ],
  paid_total: '1478.00',
  change_total: '22.00',
  eta: { status: 'pending', uuid: UUID, qr_payload: QR, last_error_code: null },
  ...over,
});

const ALL_ON = {
  logo: true,
  address: true,
  phone: true,
  tax_registration_no: true,
  branch: true,
  cashier: true,
  customer: true,
};
const shop = (over: Partial<ShopSettings> = {}) =>
  ({
    name: 'Shop A',
    address: '12 Tahrir St, Cairo',
    phone: '01000000001',
    timezone: 'Africa/Cairo',
    default_language: 'ar',
    logo_file_id: null,
    tax_registration_no: '674859545',
    receipt_header: 'Welcome\nOpen daily',
    receipt_footer: 'Thank you\nReturns within 14 days',
    receipt_width_mm: 80,
    receipt_fields: ALL_ON,
    ...over,
  }) as ShopSettings;

function paperOf(over: Partial<SaleReceiptProps> = {}) {
  const props: SaleReceiptProps = {
    sale: sale(),
    shop: shop(),
    branchName: 'Main branch',
    logoUrl: null,
    lang: 'en',
    paper: 'thermal',
    copy: false,
    ...over,
  };
  const { container } = render(<SaleReceipt {...props} />);
  return container.querySelector<HTMLElement>('.receipt')!;
}
const printRoot = () => document.querySelector<HTMLElement>('[data-receipt-print]');
const amount = (root: HTMLElement, name: string) =>
  root.querySelector(`[data-amount="${name}"]`)?.textContent;

describe('S04 sale receipt (paper)', () => {
  const cases: [SaleReceiptProps['paper'], Language][] = [
    ['thermal', 'ar'],
    ['thermal', 'en'],
    ['a4', 'ar'],
    ['a4', 'en'],
  ];
  it.each(cases)('%s in %s prints every part from the sale answer', (paper, lang) => {
    const s = sale();
    const root = paperOf({ paper, lang });
    const tr = (key: Parameters<typeof t>[0], p?: Record<string, string>) => t(key, p, lang);
    expect(root).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    expect(root).toHaveAttribute('lang', lang);
    const has = (text: string) => expect(root).toHaveTextContent(text);

    ['Shop A', 'Open daily', '12 Tahrir St, Cairo', '01000000001', '674859545'].forEach(has);
    has('Main branch');
    has(tr('receipts.doc.title'));
    has(s.number);
    has(s.shift_number!);
    has('Omar Cashier');
    has('Mona Adel');
    // Lines: the name in the receipt's language, the serial or the SKU, the warranty.
    has(lang === 'ar' ? 'كرسي 1' : 'Chair 1');
    has(lang === 'ar' ? 'هاتف' : 'Phone');
    has('CH-1');
    has('356938035643809');
    expect(root).not.toHaveTextContent('PH-1');
    expect(root.querySelectorAll('[data-line]')).toHaveLength(2);
    expect(within(root).getAllByText(/2027/)).toHaveLength(1);
    has(formatMoney('250.00', lang));
    has(formatMoney('475.00', lang));
    has(formatMoney('25.00', lang));
    // Totals: each one is the sale's own field, only formatted.
    for (const key of ['subtotal', 'discount_total', 'tax_total', 'total', 'change_total'] as const)
      expect(amount(root, key)).toBe(formatMoney(s[key], lang));
    has(tr('receipts.doc.vatIncluded'));
    // Payments.
    has(tr('receipts.doc.methods.cash'));
    has(tr('receipts.doc.methods.bank_transfer'));
    has(formatMoney('978.00', lang));
    has(formatMoney('500.00', lang));
    has('TRX-7781');
    has(formatMoney('1000.00', lang));
    // ETA and the footer.
    has(UUID);
    expect(root.querySelector('[data-qr]')).toHaveAttribute('data-qr', QR);
    has('Returns within 14 days');
    expect(root.querySelector('[data-mark]')).toBeNull();
  });

  it('says VAT is added when prices exclude it', () => {
    expect(paperOf({ sale: sale({ prices_include_vat: false }) })).toHaveTextContent(
      'VAT is added to the prices.',
    );
  });

  it.each(Object.keys(ALL_ON) as (keyof typeof ALL_ON)[])(
    'the %s switch hides only its part',
    (field) => {
      const off = paperOf({
        shop: shop({ receipt_fields: { ...ALL_ON, [field]: false } }),
        logoUrl: 'https://files.test/logo.png',
      });
      const gone: Record<keyof typeof ALL_ON, () => void> = {
        logo: () => expect(off.querySelector('img')).toBeNull(),
        address: () => expect(off).not.toHaveTextContent('Tahrir'),
        phone: () => expect(off).not.toHaveTextContent('01000000001'),
        tax_registration_no: () => expect(off).not.toHaveTextContent('Tax registration'),
        branch: () => expect(off).not.toHaveTextContent('Main branch'),
        cashier: () => expect(off).not.toHaveTextContent('Omar Cashier'),
        customer: () => expect(off).not.toHaveTextContent('Mona Adel'),
      };
      gone[field]();
      const kept = [
        ['logo', () => expect(off.querySelector('img')).not.toBeNull()],
        ['address', () => expect(off).toHaveTextContent('Tahrir')],
        ['phone', () => expect(off).toHaveTextContent('01000000001')],
        ['tax_registration_no', () => expect(off).toHaveTextContent('Tax registration')],
        ['branch', () => expect(off).toHaveTextContent('Main branch')],
        ['cashier', () => expect(off).toHaveTextContent('Omar Cashier')],
        ['customer', () => expect(off).toHaveTextContent('Mona Adel')],
      ] as const;
      kept.filter(([name]) => name !== field).forEach(([, check]) => check());
    },
  );

  it('prints a walk-in sale, and leaves out rows that are zero or empty', () => {
    const root = paperOf({
      sale: sale({
        customer_name: null,
        discount_total: '0.00',
        change_total: '0.00',
        lines: [line(1, { discount_amount: '0.00' })],
      }),
    });
    expect(root).toHaveTextContent('Walk-in customer');
    expect(amount(root, 'discount_total')).toBeUndefined();
    expect(amount(root, 'change_total')).toBeUndefined();
    expect(root).not.toHaveTextContent('Discount');
    expect(root).not.toHaveTextContent('Warranty');
  });

  it('an English receipt falls back to the Arabic name', () => {
    const root = paperOf({ sale: sale({ lines: [line(1, { name_en: null })] }) });
    expect(root).toHaveTextContent('كرسي 1');
  });

  it('ETA: no block without a receipt; no QR for a rejected one or a voided sale', () => {
    expect(paperOf({ sale: sale({ eta: null }) }).querySelector('[data-part="eta"]')).toBeNull();

    const rejected = paperOf({
      sale: sale({ eta: { status: 'rejected', uuid: UUID, qr_payload: QR, last_error_code: 'X' } }),
    });
    expect(rejected).toHaveTextContent(UUID);
    expect(rejected.querySelector('[data-qr]')).toBeNull();

    const voided = paperOf({ sale: sale({ status: 'voided' }), copy: true });
    expect(voided.querySelector('[data-qr]')).toBeNull();
    expect(voided.querySelector('[data-mark="voided"]')).toHaveTextContent('VOIDED');
    expect(voided.querySelector('[data-mark="copy"]')).toHaveTextContent('COPY');
  });

  it('says on the paper that the e-receipt is still being issued, only while it is pending', () => {
    const none = { uuid: null, qr_payload: null, last_error_code: null };
    const pending = paperOf({ sale: sale({ eta: { ...none, status: 'pending' } }), lang: 'ar' });
    expect(pending.querySelector('[data-part="eta-pending"]')).toHaveTextContent(
      'الإيصال الإلكتروني قيد الإصدار',
    );
    expect(pending.querySelector('[data-qr]')).toBeNull();
    for (const status of ['failed', 'rejected', 'cancelled'] as const)
      expect(
        paperOf({ sale: sale({ eta: { ...none, status } }) }).querySelector('[data-part="eta"]'),
      ).toBeNull();
    expect(paperOf().querySelector('[data-part="eta-pending"]')).toBeNull();
    expect(
      paperOf({
        sale: sale({ status: 'voided', eta: { ...none, status: 'pending' } }),
      }).querySelector('[data-part="eta-pending"]'),
    ).toBeNull();
  });

  it.each(['thermal', 'a4'] as const)('prints all 60 lines of a long sale on %s', (paper) => {
    const root = paperOf({
      paper,
      sale: sale({ lines: Array.from({ length: 60 }, (_, i) => line(i + 1)) }),
    });
    expect(root.querySelectorAll('[data-line]')).toHaveLength(60);
    expect(root).toHaveTextContent('Chair 60');
  });

  it('the page rule follows the paper', () => {
    expect(receiptPageCss('thermal', 80, 143)).toBe('@page { size: 80mm 143mm; margin: 0; }');
    expect(receiptPageCss('thermal', 58, null)).toBe('@page { size: 58mm 297mm; margin: 0; }');
    expect(receiptPageCss('a4', 80, 143)).toBe('@page { size: A4; margin: 12mm; }');
    expect(paperOf().style.getPropertyValue('--receipt-width')).toBe('72mm');
    expect(
      paperOf({ shop: shop({ receipt_width_mm: 58 }) }).style.getPropertyValue('--receipt-width'),
    ).toBe('48mm');
  });
});

describe('N02 installment block on the receipt', () => {
  const contract: NonNullable<SaleReceiptProps['contract']> = {
    number: 'MAIN-CT-26-000001',
    down_payment: '1200.00',
    financed_amount: '10800.00',
    total_payable: '12960.00',
    installments_count: 12,
    first_due_date: '2026-11-16',
    last_due_date: '2027-10-16',
    lines: [
      {
        seq: 1,
        due_date: '2026-11-16',
        principal: '900.00',
        profit: '180.00',
        amount: '1080.00',
        paid: '0.00',
        remaining: '1080.00',
        status: 'upcoming',
      },
    ],
  };
  it.each(['thermal', 'a4'] as const)(
    '%s prints the contract number, down payment and installments',
    (paper) => {
      const root = paperOf({ paper, contract });
      const block = root.querySelector<HTMLElement>('[data-part="installment"]')!;
      expect(block).toHaveTextContent('MAIN-CT-26-000001');
      expect(block).toHaveTextContent(formatMoney('1200.00', 'en'));
      expect(block.querySelector('[data-amount="total_payable"]')).toHaveTextContent(
        formatMoney('12960.00', 'en'),
      );
      expect(block).toHaveTextContent(formatMoney('1080.00', 'en'));
      expect(block).toHaveTextContent(t('receipts.doc.installment.note', {}, 'en'));
      expect(block).not.toHaveTextContent(/interest/i);
    },
  );
  it('a cash sale has no installment block', () => {
    expect(paperOf().querySelector('[data-part="installment"]')).toBeNull();
  });
});

describe('S04 QR code', () => {
  it('encodes a known text as a version 1 symbol with its fixed patterns', () => {
    const m = qrMatrix('HELLO')!;
    expect(m).toHaveLength(21);
    // The three finder patterns: a dark 7x7 ring, a light ring inside, a dark 3x3 centre.
    for (const [r, c] of [
      [0, 0],
      [0, 14],
      [14, 0],
    ] as const) {
      expect(m[r]!.slice(c, c + 7)).toEqual(Array(7).fill(true));
      expect(m[r + 1]!.slice(c, c + 7)).toEqual([true, false, false, false, false, false, true]);
      expect(m[r + 3]![c + 3]).toBe(true);
    }
    // The timing pattern alternates between the finders.
    expect(m[6]!.slice(8, 13)).toEqual([true, false, true, false, true]);
    // The same text always gives the same symbol.
    expect(qrMatrix('HELLO')).toEqual(m);
    expect(qrMatrix('HELLO!')).not.toEqual(m);
  });

  it('draws the ETA text unchanged, with a quiet zone', () => {
    render(<QrCode value={QR} label="QR" sizeMm={38} />);
    const svg = screen.getByRole('img', { name: 'QR' });
    const n = Number(svg.getAttribute('data-modules'));
    expect(n).toBe(qrMatrix(QR)!.length);
    expect(n).toBeGreaterThanOrEqual(41);
    expect(svg).toHaveAttribute('data-qr', QR);
    const size = n + QR_QUIET_ZONE * 2;
    expect(svg).toHaveAttribute('viewBox', `0 0 ${size} ${size}`);
    expect(svg.querySelector('path')!.getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  });
});

describe('S04 print dialog', () => {
  let print: ReturnType<typeof vi.spyOn>;
  let getSettings: ReturnType<typeof vi.spyOn>;
  let record: ReturnType<typeof vi.spyOn>;
  const user = () => userEvent.setup();
  const openButton = () => screen.getByRole('button', { name: t('receipts.print') });
  // The dialog's own X is also named "Close": ours is the last one.
  const closeButton = () =>
    screen.getAllByRole('button', { name: t('receipts.dialog.close') }).at(-1)!;
  const printButton = () => screen.findByRole('button', { name: t('receipts.dialog.printNow') });

  beforeEach(() => {
    signIn('CASHIER');
    window.localStorage.clear();
    print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    getSettings = vi.spyOn(settingsApi, 'get').mockResolvedValue(shop());
    // The server numbers the prints: the first of a sale is the original.
    const counts = new Map<string, number>();
    record = vi.spyOn(salesHistoryApi, 'recordReceiptPrint').mockImplementation(async (saleId) => {
      const n = (counts.get(saleId) ?? 0) + 1;
      counts.set(saleId, n);
      return { print_no: n, copy: n > 1 };
    });
    vi.spyOn(branchApi, 'list').mockResolvedValue([{ id: MAIN, name: 'Main branch' }] as Awaited<
      ReturnType<typeof branchApi.list>
    >);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
    ETA_POLL.everyMs = 2000;
  });

  it('prints once, only the receipt, and cleans up after itself', async () => {
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    expect(printRoot()).toBeNull();
    const u = user();
    await u.click(openButton());
    const button = await printButton();
    await waitFor(() => expect(button).toHaveFocus());
    const root = printRoot()!;
    expect(root.parentElement).toBe(document.body);
    expect(root).toHaveTextContent('MAIN-SL-26-000042');
    expect(root).toHaveTextContent('Main branch');
    expect(root.querySelector('style')!.textContent).toMatch(
      /@page \{ size: 80mm \d+mm; margin: 0/,
    );
    expect(within(screen.getByRole('dialog')).getByLabelText('Receipt preview')).toHaveTextContent(
      'MAIN-SL-26-000042',
    );

    await u.keyboard('{Enter}');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(id(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(printRoot()).toBeNull();
    await waitFor(() => expect(openButton()).toHaveFocus());
  });

  // INT4-B1: in development React StrictMode mounts, unmounts and mounts again; the print must
  // still reach the browser's print window (it used to stop after logging the print).
  it('prints under StrictMode too: the print window opens and the dialog closes', async () => {
    await renderApp(
      <StrictMode>
        <PrintReceipt sale={sale()} original />
      </StrictMode>,
      { lang: 'en' },
    );
    const u = user();
    await u.click(openButton());
    await u.click(await printButton());
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the first print from the done card is the original, later ones are copies', async () => {
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).toBeNull();
    await u.click(await printButton());

    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).not.toBeNull();
    expect(screen.getByText('This print is marked as a copy.')).toBeInTheDocument();
  });

  it('a new sale starts with an original again; the sale page always prints a copy', async () => {
    const view = await renderApp(<PrintReceipt key="a" sale={sale()} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await u.click(await printButton());
    view.rerender(<PrintReceipt key="b" sale={sale({ id: id(50) })} original />);
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).toBeNull();
    await u.click(closeButton());

    view.rerender(
      <PrintReceipt
        key="c"
        sale={sale({ branch: { name: 'From the sale' }, status: 'completed' })}
      />,
    );
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).not.toBeNull();
    // The sale page's answer names the branch itself.
    expect(printRoot()).toHaveTextContent('From the sale');
  });

  it('the sale page prints the original when the sale was never printed, a copy otherwise', async () => {
    const marks: boolean[] = [];
    print.mockImplementation(() => {
      marks.push(!!printRoot()!.querySelector('[data-mark="copy"]'));
    });
    const view = await renderApp(<PrintReceipt key="a" sale={sale({ receipt_prints: 0 })} />, {
      lang: 'en',
    });
    const u = user();
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).toBeNull();
    await u.click(await printButton());
    await waitFor(() => expect(marks).toEqual([false]));
    // The same screen again: now a copy, without reading the sale again.
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).not.toBeNull();
    await u.click(closeButton());

    view.rerender(<PrintReceipt key="b" sale={sale({ id: id(51), receipt_prints: 2 })} />);
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-mark="copy"]')).not.toBeNull();
  });

  it('the server has the last word: a receipt printed on another till comes out as a copy', async () => {
    record.mockResolvedValue({ print_no: 2, copy: true });
    const marks: boolean[] = [];
    print.mockImplementation(() => {
      marks.push(!!printRoot()!.querySelector('[data-mark="copy"]'));
    });
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await printButton();
    // The done card expects an original...
    expect(printRoot()!.querySelector('[data-mark="copy"]')).toBeNull();
    await u.click(await printButton());
    // ...but the paper carries what the server answered.
    await waitFor(() => expect(marks).toEqual([true]));
  });

  it('prints anyway when the print cannot be logged, on what the screen knows', async () => {
    record.mockRejectedValue(new Error('offline'));
    const marks: boolean[] = [];
    print.mockImplementation(() => {
      marks.push(!!printRoot()!.querySelector('[data-mark="copy"]'));
    });
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await u.click(await printButton());
    await waitFor(() => expect(marks).toEqual([false]));
    await u.click(openButton());
    await u.click(await printButton());
    await waitFor(() => expect(marks).toEqual([false, true]));
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('one press logs and prints once, even when pressed twice', async () => {
    let answer: (v: { print_no: number; copy: boolean }) => void = () => undefined;
    record.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    const button = await printButton();
    await u.click(button);
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP', ctrlKey: true });
    expect(print).not.toHaveBeenCalled();
    answer({ print_no: 1, copy: false });
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('starts in the shop language, and remembers the paper and language on the device', async () => {
    // The screen is English, the shop prints Arabic.
    const view = await renderApp(<PrintReceipt key="a" sale={sale()} />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('.receipt')).toHaveAttribute('lang', 'ar');
    expect(printRoot()!.querySelector('.receipt')).toHaveClass('receipt-thermal');
    expect(screen.getByLabelText('Thermal roll 80 mm')).toBeChecked();

    await u.click(screen.getByLabelText('English'));
    await u.click(screen.getByLabelText('A4'));
    expect(printRoot()!.querySelector('.receipt')).toHaveAttribute('lang', 'en');
    expect(printRoot()!.querySelector('.receipt')).toHaveClass('receipt-a4');
    expect(printRoot()!.querySelector('style')!.textContent).toContain('size: A4');
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toEqual({
      paper: 'a4',
      lang: 'en',
    });
    await u.click(closeButton());

    view.rerender(<PrintReceipt key="b" sale={sale()} />);
    await u.click(openButton());
    await printButton();
    expect(screen.getByLabelText('A4')).toBeChecked();
    expect(printRoot()!.querySelector('.receipt')).toHaveAttribute('lang', 'en');
  });

  it('ignores broken stored preferences', async () => {
    window.localStorage.setItem(PREFS_KEY, '{"paper":"papyrus","lang":7');
    await renderApp(<PrintReceipt sale={sale()} />, { lang: 'ar' });
    await user().click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('.receipt')).toHaveClass('receipt-thermal');
    expect(printRoot()!.querySelector('.receipt')).toHaveAttribute('lang', 'ar');
  });

  it('Ctrl+P opens the dialog instead of printing the screen, then prints', async () => {
    await renderApp(<PrintReceipt sale={sale()} original />, { lang: 'en' });
    const first = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      ctrlKey: true,
      cancelable: true,
    });
    fireEvent(window, first);
    expect(first.defaultPrevented).toBe(true);
    await waitFor(async () => expect(await printButton()).toBeEnabled());
    expect(print).not.toHaveBeenCalled();
    // An Arabic keyboard sends another letter for the same key.
    fireEvent.keyDown(window, { key: 'ح', code: 'KeyP', metaKey: true });
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

    const plain = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', cancelable: true });
    fireEvent(window, plain);
    expect(plain.defaultPrevented).toBe(false);
  });

  it('leaves Ctrl+P alone once the button is gone', async () => {
    const view = await renderApp(<PrintReceipt sale={sale()} />, { lang: 'en' });
    view.unmount();
    const event = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      ctrlKey: true,
      cancelable: true,
    });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('waits for the ETA receipt, then prints it with the QR code', async () => {
    ETA_POLL.everyMs = 5;
    const pending = {
      status: 'pending',
      uuid: null,
      qr_payload: null,
      last_error_code: null,
    } as const;
    const get = vi
      .spyOn(salesApi, 'get')
      .mockResolvedValueOnce(sale({ eta: pending }))
      .mockResolvedValue(sale());
    await renderApp(<PrintReceipt sale={sale({ eta: pending })} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await waitFor(() => expect(printRoot()?.querySelector('[data-qr]')).toBeTruthy());
    expect(printRoot()!.querySelector('[data-qr]')).toHaveAttribute('data-qr', QR);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(id(2));
    expect(screen.queryByText('Waiting for the ETA receipt…')).not.toBeInTheDocument();

    // A second print of the same done card needs no new wait.
    await u.click(await printButton());
    await u.click(openButton());
    await printButton();
    expect(printRoot()!.querySelector('[data-qr]')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('stops asking after 5 tries and prints without the QR code', async () => {
    ETA_POLL.everyMs = 5;
    const pending = {
      status: 'pending',
      uuid: null,
      qr_payload: null,
      last_error_code: null,
    } as const;
    const get = vi.spyOn(salesApi, 'get').mockResolvedValue(sale({ eta: pending }));
    await renderApp(<PrintReceipt sale={sale({ eta: pending })} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    expect(await screen.findByText(/The ETA receipt is not ready/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(5);
    await new Promise((r) => setTimeout(r, 40));
    expect(get).toHaveBeenCalledTimes(5);
    // The note is for the screen, not the paper.
    expect(printRoot()).not.toHaveTextContent('not ready');
    // The paper itself says so (in the shop language, Arabic here).
    expect(printRoot()!.querySelector('[data-part="eta-pending"]')).toHaveTextContent(
      'الإيصال الإلكتروني قيد الإصدار',
    );
    expect(printRoot()!.querySelector('[data-qr]')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Print without QR code' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('stops asking when the dialog closes', async () => {
    ETA_POLL.everyMs = 20;
    const pending = {
      status: 'pending',
      uuid: null,
      qr_payload: null,
      last_error_code: null,
    } as const;
    const get = vi.spyOn(salesApi, 'get').mockResolvedValue(sale({ eta: pending }));
    await renderApp(<PrintReceipt sale={sale({ eta: pending })} original />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    expect(await screen.findByText('Waiting for the ETA receipt…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Print without QR code' })).toBeEnabled();
    await waitFor(() => expect(get).toHaveBeenCalled());
    await u.click(closeButton());
    const calls = get.mock.calls.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(get.mock.calls.length).toBe(calls);
  });

  it('does not print without the shop settings, and retries', async () => {
    getSettings.mockRejectedValueOnce(new Error('down'));
    await renderApp(<PrintReceipt sale={sale()} />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The shop's receipt settings could not be loaded.",
    );
    expect(await printButton()).toBeDisabled();
    expect(printRoot()).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(async () => expect(await printButton()).toBeEnabled());
    expect(printRoot()).toHaveTextContent('Shop A');
  });

  it('prints without the logo when its link fails, and without the branch when unknown', async () => {
    getSettings.mockResolvedValue(shop({ logo_file_id: id(60) }));
    const logoUrl = vi.spyOn(settingsApi, 'logoUrl').mockRejectedValue(new Error('gone'));
    vi.mocked(branchApi.list).mockRejectedValue(new Error('down'));
    await renderApp(<PrintReceipt sale={sale()} />, { lang: 'en' });
    const u = user();
    await u.click(openButton());
    await waitFor(async () => expect(await printButton()).toBeEnabled());
    expect(logoUrl).toHaveBeenCalledWith(id(60));
    expect(printRoot()!.querySelector('img')).toBeNull();
    expect(printRoot()).not.toHaveTextContent('Branch');
    await u.click(await printButton());
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('shows the logo and waits for it before printing', async () => {
    getSettings.mockResolvedValue(shop({ logo_file_id: id(60) }));
    vi.spyOn(settingsApi, 'logoUrl').mockResolvedValue({
      url: 'https://files.test/logo.png',
      expiresAt: '2026-10-13T10:00:00Z',
    });
    await renderApp(<PrintReceipt sale={sale()} />, { lang: 'en' });
    await user().click(openButton());
    const img = await waitFor(() => {
      const el = printRoot()?.querySelector('img');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(img).toHaveAttribute('src', 'https://files.test/logo.png');
    expect(
      screen.getByRole('dialog').querySelector('button[aria-busy="true"], button:disabled'),
    ).not.toBeNull();
    fireEvent.load(img);
    await waitFor(async () => expect(await printButton()).toBeEnabled());
  });
});
