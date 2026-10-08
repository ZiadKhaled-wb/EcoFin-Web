import { useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  StockAdjustmentCreateBody,
  type BranchSummary,
  type ManualAdjustmentReason,
  type Product,
  type ProductUnit,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { getLanguage, t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
import { productKeys, productsApi } from '@/services/productsApi';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';

type Direction = 'in' | 'out';
interface Line {
  key: string;
  product: Product;
  unit: ProductUnit | null;
  quantity: string;
  direction: Direction;
}

const REASONS: ManualAdjustmentReason[] = ['damage', 'loss', 'found', 'correction', 'other'];
/** The direction a reason forces; correction and other let each line choose. */
const FIXED: Partial<Record<ManualAdjustmentReason, Direction>> = {
  damage: 'out',
  loss: 'out',
  found: 'in',
};

const API_ERRORS: Partial<Record<string, TranslationKey>> = {
  ADJUSTMENT_SIGN_INVALID: 'stock.adjustments.errors.sign',
  OUT_OF_STOCK: 'stock.adjustments.errors.outOfStock',
  UNIT_NOT_AVAILABLE: 'stock.adjustments.errors.unit',
  UNIT_ALREADY_IN_STOCK: 'stock.adjustments.errors.unit',
  UNIT_PRODUCT_MISMATCH: 'stock.adjustments.errors.unit',
  UNIT_REQUIRED: 'stock.adjustments.errors.unit',
  DAY_CLOSED: 'stock.adjustments.errors.dayClosed',
  PERMISSION_DENIED: 'stock.adjustments.errors.permission',
  BRANCH_DENIED: 'stock.adjustments.errors.branch',
  BRANCH_INACTIVE: 'stock.adjustments.errors.branch',
  PRODUCT_NOT_FOUND: 'stock.adjustments.errors.notFound',
  UNIT_NOT_FOUND: 'stock.adjustments.errors.notFound',
  VALIDATION_FAILED: 'stock.adjustments.errors.validation',
};

const productName = (p: Product) => (getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar);

/** I02: a new adjustment (stock.adjust). Mount it per opening: it starts empty with a new key. */
export default function AdjustmentForm({
  branches,
  onClose,
}: {
  branches: BranchSummary[];
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [reason, setReason] = useState<ManualAdjustmentReason>('damage');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [unitsFor, setUnitsFor] = useState<Product | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fixed = FIXED[reason];

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: search.length > 0,
  });
  // Removing: serials in stock here. Found: serials written off earlier.
  const unitStatus = (fixed ?? 'out') === 'in' ? 'written_off' : 'in_stock';
  const units = useQuery({
    queryKey: [...productKeys.units(orgId, unitsFor?.id ?? ''), unitStatus],
    queryFn: () => productsApi.units(unitsFor!.id, unitStatus),
    enabled: !!unitsFor,
  });
  const unitChoices = (units.data ?? []).filter(
    (u) =>
      (unitStatus === 'written_off' || u.branch_id === branchId) &&
      !lines.some((l) => l.unit?.id === u.id),
  );

  function addProduct(product: Product) {
    if (product.is_serialized) {
      setPicked(new Set());
      setUnitsFor(product);
      return;
    }
    setLines((list) =>
      list.some((l) => !l.unit && l.product.id === product.id)
        ? list
        : [
            ...list,
            { key: product.id, product, unit: null, quantity: '1', direction: fixed ?? 'out' },
          ],
    );
  }

  function addUnits() {
    if (!unitsFor) return;
    const chosen = unitChoices.filter((u) => picked.has(u.id));
    setLines((list) => [
      ...list,
      ...chosen.map((u) => ({
        key: u.id,
        product: unitsFor,
        unit: u,
        quantity: '1',
        direction: (fixed ?? 'out') as Direction,
      })),
    ]);
    setUnitsFor(null);
  }

  function chooseReason(next: ManualAdjustmentReason) {
    setReason(next);
    const forced = FIXED[next];
    // A forced direction applies to every line; serials picked for the other way no longer fit.
    if (forced) {
      setLines((list) =>
        list
          .filter((l) => !l.unit || l.direction === forced)
          .map((l) => ({ ...l, direction: forced })),
      );
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = StockAdjustmentCreateBody.safeParse({
      branch_id: branchId,
      reason,
      note: note.trim() || undefined,
      lines: lines.map((l) => {
        const size = l.unit ? 1 : Number(l.quantity || '0');
        return {
          product_id: l.product.id,
          ...(l.unit ? { unit_id: l.unit.id } : {}),
          quantity: l.direction === 'out' ? -size : size,
        };
      }),
    });
    if (lines.length === 0) {
      setError(t('stock.adjustments.form.noLines'));
      return;
    }
    if (!parsed.success) {
      const noteIssue = parsed.error.issues.some((i) => i.path[0] === 'note');
      setError(
        t(
          noteIssue ? 'stock.adjustments.form.noteRequired' : 'stock.adjustments.errors.validation',
        ),
      );
      return;
    }
    setSaving(true);
    try {
      const posted = await stockApi.postAdjustment(parsed.data, key);
      notify.success(t('stock.adjustments.form.posted', { number: posted.number }));
      await cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(t(API_ERRORS[code] ?? 'stock.adjustments.errors.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.adjustments.form.title')}
      description={t('stock.adjustments.form.help')}
      className="max-w-3xl!"
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('stock.adjustments.form.branch')}
            value={branchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(e) => {
              setBranchId(e.target.value);
              // Serials belong to a branch: pick them again for the new one.
              setLines((list) => list.filter((l) => !l.unit));
            }}
          />
          <Select
            label={t('stock.adjustments.form.reason')}
            value={reason}
            options={REASONS.map((r) => ({ value: r, label: t(`stock.reasons.${r}`) }))}
            onChange={(e) => chooseReason(e.target.value as ManualAdjustmentReason)}
          />
        </div>
        <Textarea
          label={t('stock.adjustments.form.note')}
          value={note}
          maxLength={500}
          rows={2}
          required={reason === 'other'}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="space-y-2">
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            label={t('stock.adjustments.form.search')}
            placeholder={t('stock.adjustments.form.search')}
          />
          {search && results.data?.items.length === 0 && (
            <p className="type-caption">{t('stock.adjustments.form.noResults')}</p>
          )}
          {search && (results.data?.items.length ?? 0) > 0 && (
            <ul className="divide-y divide-line rounded-card border border-line">
              {(results.data?.items ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{productName(p)}</span>
                    <span className="type-caption block" dir="ltr">
                      {p.sku}
                    </span>
                  </span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => addProduct(p)}>
                    {t(
                      p.is_serialized
                        ? 'stock.adjustments.form.chooseUnits'
                        : 'stock.adjustments.form.add',
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="type-label mb-2">{t('stock.adjustments.form.lines')}</h3>
          {lines.length === 0 ? (
            <p className="type-caption">{t('stock.adjustments.form.noLines')}</p>
          ) : (
            <table className="w-full text-start">
              <caption className="sr-only">{t('stock.adjustments.form.lines')}</caption>
              <thead>
                <tr>
                  <th className="type-label py-2 text-start">
                    {t('stock.adjustments.form.product')}
                  </th>
                  <th className="type-label py-2 text-start">
                    {t('stock.adjustments.form.direction')}
                  </th>
                  <th className="type-label py-2 text-start">
                    {t('stock.adjustments.form.quantity')}
                  </th>
                  <th className="sr-only">{t('stock.adjustments.form.remove')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t border-line align-top">
                    <td className="py-2">
                      <span className="block">{productName(line.product)}</span>
                      <span className="type-caption block" dir="ltr">
                        {line.unit ? line.unit.serial : line.product.sku}
                      </span>
                    </td>
                    <td className="w-48 py-2 [&_.field-label]:sr-only">
                      {fixed || line.unit ? (
                        t(
                          line.direction === 'in'
                            ? 'stock.adjustments.form.add_in'
                            : 'stock.adjustments.form.remove_out',
                        )
                      ) : (
                        <Select
                          label={t('stock.adjustments.form.direction')}
                          value={line.direction}
                          options={[
                            { value: 'out', label: t('stock.adjustments.form.remove_out') },
                            { value: 'in', label: t('stock.adjustments.form.add_in') },
                          ]}
                          onChange={(e) =>
                            setLines((list) =>
                              list.map((l) =>
                                l.key === line.key
                                  ? { ...l, direction: e.target.value as Direction }
                                  : l,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="w-32 py-2 [&_.field-label]:sr-only">
                      {line.unit ? (
                        '1'
                      ) : (
                        <NumberInput
                          label={t('stock.adjustments.form.quantity')}
                          value={line.quantity}
                          decimals={0}
                          maxLength={7}
                          onValueChange={(quantity) =>
                            setLines((list) =>
                              list.map((l) => (l.key === line.key ? { ...l, quantity } : l)),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="py-2 text-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}
                      >
                        {t('stock.adjustments.form.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            {t('stock.adjustments.form.submit')}
          </Button>
        </div>
      </form>

      <Dialog
        open={!!unitsFor}
        onOpenChange={(v) => !v && setUnitsFor(null)}
        title={t('stock.adjustments.form.unitsTitle', {
          name: unitsFor ? productName(unitsFor) : '',
        })}
        description={t(
          unitStatus === 'written_off'
            ? 'stock.adjustments.form.unitsHelpIn'
            : 'stock.adjustments.form.unitsHelpOut',
        )}
      >
        <div className="space-y-3">
          {units.isError && <p role="alert">{t('stock.adjustments.form.unitsFailed')}</p>}
          {units.data && unitChoices.length === 0 && (
            <p className="type-caption">{t('stock.adjustments.form.noUnits')}</p>
          )}
          {unitChoices.map((u) => (
            <Checkbox
              key={u.id}
              label={<span dir="ltr">{u.serial}</span>}
              checked={picked.has(u.id)}
              onChange={(e) =>
                setPicked((set) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(u.id);
                  else next.delete(u.id);
                  return next;
                })
              }
            />
          ))}
          <Button type="button" disabled={picked.size === 0} onClick={addUnits}>
            {t('stock.adjustments.form.addUnits')}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
