import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SupplierPaymentCreateBody, Uuid, compareMoney } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { cashKeys } from '@/services/cashApi';
import { purchaseInvoiceKeys } from '@/services/purchaseInvoicesApi';
import { purchaseReturnKeys, purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { supplierPaymentKeys, supplierPaymentsApi } from '@/services/supplierPaymentsApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { allocatedTotal, fillOldestFirst, paymentError, typedMoney } from './supplierPaymentShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start align-top';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end align-top';
const uuidOrEmpty = (v: string | null) => (v && Uuid.safeParse(v).success ? v : '');

/**
 * U03: pay a supplier from a safe or bank. The amount is split over the supplier's open invoices
 * (typed per invoice, or "Fill oldest first"); Pay is enabled once the split equals the amount.
 * One idempotency key per form: a double click pays once.
 */
export default function SupplierPaymentFormPage() {
  const [search] = useSearchParams();
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const branches = useBranches();
  // Ids from the URL are used only when they are UUIDs.
  const [supplierId, setSupplierId] = useState(() => uuidOrEmpty(search.get('supplier_id')));
  const [presetInvoice] = useState(() => uuidOrEmpty(search.get('invoice_id')));
  const [prefilled, setPrefilled] = useState(false);
  const [pickedBranch, setPickedBranch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // One key per form: a double submit pays once.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);

  const suppliers = useQuery({
    queryKey: supplierKeys.list(orgId, { status: 'active', pageSize: 100 }),
    queryFn: () => suppliersApi.list({ status: 'active', pageSize: 100 }),
  });
  const open = useQuery({
    queryKey: supplierPaymentKeys.open(orgId, supplierId),
    queryFn: () => supplierPaymentsApi.openInvoices(supplierId),
    enabled: supplierId !== '',
  });
  const invoices = open.data?.items ?? [];
  // An invoice from the URL comes pre-selected with what is owed on it, paid from its branch.
  const preset = invoices.find((i) => i.purchase_invoice_id === presetInvoice);
  if (!prefilled && preset) {
    setPrefilled(true);
    setAmount(preset.outstanding);
    setAllocations({ [preset.purchase_invoice_id]: preset.outstanding });
    setPickedBranch(preset.branch_id);
  }
  const branchId = pickedBranch || (branches.data ?? [])[0]?.id || '';
  const accounts = useQuery({
    queryKey: purchaseReturnKeys.cashAccounts(orgId, branchId),
    queryFn: () => purchaseReturnsApi.cashAccounts(branchId),
    enabled: branchId !== '',
  });

  const validAmount = typedMoney(amount);
  const allocated = allocatedTotal(allocations);
  const matches = validAmount !== null && compareMoney(allocated, validAmount) === 0;
  const ready = supplierId !== '' && branchId !== '' && accountId !== '' && matches;

  function pickSupplier(id: string) {
    setSupplierId(id);
    setAllocations({});
    setFormError('');
  }
  function pickBranch(id: string) {
    setPickedBranch(id);
    setAccountId('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (posting.current || !ready) return;
    const parsed = SupplierPaymentCreateBody.safeParse({
      supplier_id: supplierId,
      branch_id: branchId,
      cash_account_id: accountId,
      amount,
      ...(reference.trim() ? { reference } : {}),
      allocations: Object.entries(allocations)
        .filter(([, v]) => typedMoney(v) !== null)
        .map(([purchase_invoice_id, v]) => ({ purchase_invoice_id, amount: v })),
    });
    if (!parsed.success) {
      setFormError(t('purchases.errors.validation'));
      return;
    }
    posting.current = true;
    setBusy(true);
    setFormError('');
    try {
      const paid = await supplierPaymentsApi.create(parsed.data, key);
      notify.success(t('purchases.payments.form.posted', { number: paid.number }));
      await Promise.all([
        cache.invalidateQueries({ queryKey: supplierPaymentKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: purchaseReturnKeys.all(orgId) }),
      ]);
      navigate(`/purchasing/payments/${paid.id}`);
    } catch (err) {
      setFormError(paymentError(err));
      void open.refetch();
      void accounts.refetch();
      // A refused call can be tried again; after a success the form stays locked until it leaves.
      posting.current = false;
      setBusy(false);
    }
  }

  const accountOptions = (accounts.data?.items ?? []).map((a) => ({
    value: a.id,
    label: `${a.name} (${formatMoney(a.balance)})`,
  }));

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.payments.form.title')}
        description={t('purchases.payments.form.help')}
        actions={
          <Link to="/purchasing/payments" className="btn btn-ghost">
            {t('purchases.payments.form.cancel')}
          </Link>
        }
      />
      <form className="space-y-4" noValidate onSubmit={(e) => void submit(e)}>
        <Card>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Select
              label={t('purchases.payments.form.supplier')}
              value={supplierId}
              placeholder={t('purchases.payments.form.chooseSupplier')}
              options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(e) => pickSupplier(e.target.value)}
            />
            <Select
              label={t('purchases.payments.form.branch')}
              value={branchId}
              options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => pickBranch(e.target.value)}
            />
            <Select
              label={t('purchases.payments.form.account')}
              value={accountId}
              placeholder={t('purchases.payments.form.chooseAccount')}
              options={accountOptions}
              help={
                accounts.isSuccess && accountOptions.length === 0
                  ? t('purchases.payments.form.noAccounts')
                  : undefined
              }
              onChange={(e) => setAccountId(e.target.value)}
            />
            <MoneyInput
              label={t('purchases.payments.form.amount')}
              value={amount}
              required
              onValueChange={setAmount}
            />
            <FormField
              label={t('purchases.payments.form.reference')}
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </Card>

        {supplierId !== '' && (
          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p>
                {t('purchases.payments.form.totalOutstanding')}:{' '}
                <span className="num">{formatMoney(open.data?.total_outstanding ?? '0.00')}</span>
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={validAmount === null || invoices.length === 0}
                onClick={() => setAllocations(fillOldestFirst(amount, invoices))}
              >
                {t('purchases.payments.form.fillOldest')}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('purchases.payments.form.invoices')}</caption>
                <thead className="border-y border-line bg-paper">
                  <tr>
                    <th className={th}>{t('purchases.payments.form.invoice')}</th>
                    <th className={th}>{t('purchases.payments.form.invoiceDate')}</th>
                    <th className={th}>{t('purchases.payments.form.dueDate')}</th>
                    <th className={thNum}>{t('purchases.payments.form.outstanding')}</th>
                    <th className={th}>{t('purchases.payments.form.allocation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {open.isSuccess && invoices.length === 0 && (
                    <tr className="border-b border-line">
                      <td colSpan={5} className={`${td} type-caption`}>
                        {t('purchases.payments.form.noInvoices')}
                      </td>
                    </tr>
                  )}
                  {invoices.map((inv) => (
                    <tr key={inv.purchase_invoice_id} className="border-b border-line">
                      <td className={td}>
                        <span dir="ltr">{inv.number}</span>
                      </td>
                      <td className={td}>{formatBusinessDate(inv.invoice_date)}</td>
                      <td className={td}>
                        <span className="block">{formatBusinessDate(inv.due_date)}</span>
                        {inv.overdue && (
                          <Badge tone="danger">{t('purchases.payments.form.overdue')}</Badge>
                        )}
                      </td>
                      <td className={tdNum}>{formatMoney(inv.outstanding)}</td>
                      <td className={td}>
                        <MoneyInput
                          label={t('purchases.payments.form.allocationFor', {
                            number: inv.number,
                          })}
                          value={allocations[inv.purchase_invoice_id] ?? ''}
                          onValueChange={(v) =>
                            setAllocations((a) => ({ ...a, [inv.purchase_invoice_id]: v }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3" aria-live="polite">
              {t('purchases.payments.form.allocated')}:{' '}
              <span className="num">{formatMoney(allocated)}</span>
              {validAmount !== null && !matches && (
                <span className="ms-3 text-danger-700">
                  {t('purchases.payments.form.mismatch')}
                </span>
              )}
            </p>
          </Card>
        )}

        {formError && <FormError message={formError} />}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={busy || !ready}>
            {t('purchases.payments.form.submit')}
          </Button>
          <Link to="/purchasing/payments" className="btn btn-secondary">
            {t('purchases.payments.form.cancel')}
          </Link>
        </div>
      </form>
    </PageContainer>
  );
}
