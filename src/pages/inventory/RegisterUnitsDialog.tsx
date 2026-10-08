import { useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SerialTakenDetail,
  UnitRegisterBody,
  type BranchSummary,
  type Product,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import MoneyInput from '@/components/ui/MoneyInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { getLanguage, t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
import { productKeys, productsApi } from '@/services/productsApi';
import { stockKeys } from '@/services/stockApi';
import { unitKeys, unitsApi } from '@/services/unitsApi';
import { useAuthStore } from '@/store/authStore';

const API_ERRORS: Partial<Record<string, TranslationKey>> = {
  SERIAL_INVALID: 'stock.units.register.invalid',
  MODULE_NOT_IN_PLAN: 'stock.units.register.module',
  PERMISSION_DENIED: 'stock.units.register.permission',
  BRANCH_DENIED: 'stock.units.register.branchDenied',
  BRANCH_INACTIVE: 'stock.units.register.branchDenied',
  VALIDATION_FAILED: 'stock.units.register.invalid',
};

const productName = (p: Product) => (getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar);
/** The serials of the text box: one per line, blank lines ignored. */
const serialsOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

/** I04: registers serials the shop already holds. Mounted per opening: a new idempotency key. */
export default function RegisterUnitsDialog({
  branches,
  onClose,
}: {
  branches: BranchSummary[];
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const [product, setProduct] = useState<Product | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [cost, setCost] = useState('');
  const [text, setText] = useState('');
  const [scan, setScan] = useState('');
  const [note, setNote] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: !product && search.length > 0,
  });
  const serialized = (results.data?.items ?? []).filter((p) => p.is_serialized);
  const serials = serialsOf(text);

  function addScan(e: FormEvent) {
    e.preventDefault();
    const value = scan.trim();
    if (!value) return;
    setText((v) => (v.trim() ? `${v.replace(/\s+$/, '')}\n${value}` : value));
    setScan('');
  }

  async function submit() {
    setError('');
    if (!product) return setError(t('stock.units.register.noProduct'));
    if (serials.length === 0) return setError(t('stock.units.register.noSerials'));
    if (cost === '') return setError(t('stock.units.register.badCost'));
    const parsed = UnitRegisterBody.safeParse({
      product_id: product.id,
      branch_id: branchId,
      cost,
      serials,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      const repeated = parsed.error.issues.filter((i) => i.message === 'Repeated');
      if (repeated.length > 0) {
        const names = repeated.map((i) => serials[Number(i.path[1])]?.toUpperCase());
        return setError(t('stock.units.register.taken', { serials: names.join(', ') }));
      }
      const costIssue = parsed.error.issues.some((i) => i.path[0] === 'cost');
      return setError(
        t(costIssue ? 'stock.units.register.badCost' : 'stock.units.register.invalid'),
      );
    }
    setSaving(true);
    try {
      const done = await unitsApi.register(parsed.data, key);
      notify.success(t('stock.units.register.done', { count: done.count }));
      await Promise.all([
        cache.invalidateQueries({ queryKey: unitKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
      ]);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SERIAL_TAKEN') {
        const detail = SerialTakenDetail.safeParse(err.details);
        setError(
          t('stock.units.register.taken', {
            serials: detail.success ? detail.data.serials.join(', ') : '',
          }),
        );
      } else {
        const code = err instanceof ApiError ? err.code : '';
        setError(t(API_ERRORS[code] ?? 'stock.units.register.failed'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.units.register.title')}
      description={t('stock.units.register.help')}
      className="max-w-2xl!"
      footer={
        <>
          {/* In the footer, so the error is in view however far the form is scrolled. */}
          <div className="me-auto min-w-0 flex-1">
            <FormError message={error} />
          </div>
          <Button loading={saving} onClick={() => void submit()}>
            {t('stock.units.register.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {product ? (
          <div className="flex items-center justify-between gap-2 rounded-card border border-line px-3 py-2">
            <span>{t('stock.units.register.chosen', { name: productName(product) })}</span>
            <Button size="sm" variant="ghost" onClick={() => setProduct(null)}>
              {t('stock.units.register.change')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              label={t('stock.units.register.productSearch')}
              placeholder={t('stock.units.register.productSearch')}
            />
            {search && results.data && serialized.length === 0 && (
              <p className="type-caption">{t('stock.units.register.noProducts')}</p>
            )}
            {serialized.length > 0 && (
              <ul className="divide-y divide-line rounded-card border border-line">
                {serialized.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{productName(p)}</span>
                      <span className="type-caption block" dir="ltr">
                        {p.sku}
                      </span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setProduct(p)}>
                      {t('stock.units.register.choose')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('stock.units.register.branch')}
            value={branchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(e) => setBranchId(e.target.value)}
          />
          <MoneyInput label={t('stock.units.register.cost')} value={cost} onValueChange={setCost} />
        </div>
        <form onSubmit={addScan} className="flex items-end gap-2">
          <label className="flex-1">
            <span className="field-label mb-1 block">{t('stock.units.register.scan')}</span>
            <Input
              value={scan}
              ltr
              maxLength={64}
              autoComplete="off"
              onChange={(e) => setScan(e.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!scan.trim()}>
            {t('stock.units.register.add')}
          </Button>
        </form>
        <Textarea
          label={t('stock.units.register.serials')}
          help={t('stock.units.register.serialsHelp')}
          value={text}
          rows={6}
          dir="ltr"
          onChange={(e) => setText(e.target.value)}
        />
        <p className="type-caption">{t('stock.units.register.count', { count: serials.length })}</p>
        <Textarea
          label={t('stock.units.register.note')}
          value={note}
          rows={2}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
