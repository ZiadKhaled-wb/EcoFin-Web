import { useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  StockTransferCreateBody,
  type BranchSummary,
  type Product,
  type ProductUnit,
  type StockTransfer,
  type TransferDestination,
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
import { getLanguage, t } from '@/i18n';
import { productKeys, productsApi } from '@/services/productsApi';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { transferError } from './transferShared';

interface Line {
  key: string;
  product_id: string;
  name: string;
  sku: string;
  unit_id: string | null;
  serial: string | null;
  quantity: string;
}

const productName = (p: { name_ar: string; name_en: string | null }) =>
  getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;

/**
 * I03: a new draft, or the edit of one (`transfer`). Mounted per opening: a new form starts with a
 * new idempotency key. `branches` are the caller's own (they send from one of them);
 * `destinations` are every active branch of the shop.
 */
export default function TransferForm({
  branches,
  destinations,
  transfer,
  onClose,
  onSaved,
}: {
  branches: BranchSummary[];
  destinations: TransferDestination[];
  transfer?: StockTransfer;
  onClose: () => void;
  onSaved: (transfer: StockTransfer) => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const [fromId, setFromId] = useState(transfer?.from_branch_id ?? branches[0]?.id ?? '');
  const [toId, setToId] = useState(transfer?.to_branch_id ?? '');
  const [notes, setNotes] = useState(transfer?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    (transfer?.lines ?? []).map((l) => ({
      key: l.unit_id ?? l.product_id,
      product_id: l.product_id,
      name: productName(l),
      sku: l.sku,
      unit_id: l.unit_id,
      serial: l.serial,
      quantity: String(l.qty_sent),
    })),
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [unitsFor, setUnitsFor] = useState<Product | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
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
    enabled: search.length > 0,
  });
  const units = useQuery({
    queryKey: [...productKeys.units(orgId, unitsFor?.id ?? ''), 'in_stock'],
    queryFn: () => productsApi.units(unitsFor!.id, 'in_stock'),
    enabled: !!unitsFor,
  });
  const unitChoices: ProductUnit[] = (units.data ?? []).filter(
    (u) => u.branch_id === fromId && !lines.some((l) => l.unit_id === u.id),
  );

  function addProduct(product: Product) {
    if (product.is_serialized) {
      setPicked(new Set());
      setUnitsFor(product);
      return;
    }
    setLines((list) =>
      list.some((l) => !l.unit_id && l.product_id === product.id)
        ? list
        : [
            ...list,
            {
              key: product.id,
              product_id: product.id,
              name: productName(product),
              sku: product.sku,
              unit_id: null,
              serial: null,
              quantity: '1',
            },
          ],
    );
  }

  function addUnits() {
    if (!unitsFor) return;
    const product = unitsFor;
    setLines((list) => [
      ...list,
      ...unitChoices
        .filter((u) => picked.has(u.id))
        .map((u) => ({
          key: u.id,
          product_id: product.id,
          name: productName(product),
          sku: product.sku,
          unit_id: u.id,
          serial: u.serial,
          quantity: '1',
        })),
    ]);
    setUnitsFor(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (lines.length === 0) {
      setError(t('stock.transfers.form.noLines'));
      return;
    }
    const parsed = StockTransferCreateBody.safeParse({
      from_branch_id: fromId,
      to_branch_id: toId,
      notes: notes.trim() || undefined,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        ...(l.unit_id ? { unit_id: l.unit_id } : {}),
        quantity: l.unit_id ? 1 : Number(l.quantity || '0'),
      })),
    });
    if (!parsed.success) {
      const branchIssue = parsed.error.issues.some((i) => i.path[0] === 'to_branch_id');
      setError(
        t(
          branchIssue || !toId
            ? 'stock.transfers.form.chooseBoth'
            : 'stock.transfers.errors.validation',
        ),
      );
      return;
    }
    setSaving(true);
    try {
      const saved = transfer
        ? await stockApi.updateTransfer(transfer.id, {
            notes: parsed.data.notes,
            lines: parsed.data.lines,
          })
        : await stockApi.createTransfer(parsed.data, key);
      notify.success(t('stock.transfers.form.saved', { number: saved.number }));
      await cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });
      onSaved(saved);
    } catch (err) {
      setError(transferError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={
        transfer
          ? t('stock.transfers.form.editTitle', { number: transfer.number })
          : t('stock.transfers.form.title')
      }
      description={t('stock.transfers.form.help')}
      className="max-w-3xl!"
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('stock.transfers.form.from')}
            value={fromId}
            disabled={!!transfer}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(e) => {
              setFromId(e.target.value);
              // Serials belong to a branch: choose them again for the new source.
              setLines((list) => list.filter((l) => !l.unit_id));
            }}
          />
          <Select
            label={t('stock.transfers.form.to')}
            value={toId}
            disabled={!!transfer}
            options={[
              { value: '', label: t('stock.transfers.form.chooseTo') },
              ...destinations
                .filter((d) => d.id !== fromId)
                .map((d) => ({ value: d.id, label: d.name })),
            ]}
            onChange={(e) => setToId(e.target.value)}
          />
        </div>
        <Textarea
          label={t('stock.transfers.form.notes')}
          value={notes}
          maxLength={500}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="space-y-2">
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            label={t('stock.transfers.form.search')}
            placeholder={t('stock.transfers.form.search')}
          />
          {search && results.data?.items.length === 0 && (
            <p className="type-caption">{t('stock.transfers.form.noResults')}</p>
          )}
          {search && (results.data?.items.length ?? 0) > 0 && (
            <ul className="divide-y divide-line rounded-control border border-line">
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
                        ? 'stock.transfers.form.chooseUnits'
                        : 'stock.transfers.form.add',
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="type-label mb-2">{t('stock.transfers.form.lines')}</h3>
          {lines.length === 0 ? (
            <p className="type-caption">{t('stock.transfers.form.noLines')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <caption className="sr-only">{t('stock.transfers.form.lines')}</caption>
                <thead>
                  <tr>
                    <th className="type-label py-2 text-start">
                      {t('stock.transfers.form.product')}
                    </th>
                    <th className="type-label py-2 text-start">
                      {t('stock.transfers.form.quantity')}
                    </th>
                    <th className="sr-only">{t('stock.transfers.form.remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-t border-line align-top">
                      <td className="py-2">
                        <span className="block">{line.name}</span>
                        <span className="type-caption block" dir="ltr">
                          {line.serial ?? line.sku}
                        </span>
                      </td>
                      <td className="w-32 py-2 [&_.field-label]:sr-only">
                        {line.unit_id ? (
                          '1'
                        ) : (
                          <NumberInput
                            label={`${t('stock.transfers.form.quantity')}: ${line.name}`}
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
                          {t('stock.transfers.form.remove')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            {t('stock.transfers.form.save')}
          </Button>
        </div>
      </form>

      <Dialog
        open={!!unitsFor}
        onOpenChange={(v) => !v && setUnitsFor(null)}
        title={t('stock.transfers.form.unitsTitle', {
          name: unitsFor ? productName(unitsFor) : '',
        })}
        description={t('stock.transfers.form.unitsHelp')}
      >
        <div className="space-y-3">
          {units.isError && <p role="alert">{t('stock.transfers.form.unitsFailed')}</p>}
          {units.data && unitChoices.length === 0 && (
            <p className="type-caption">{t('stock.transfers.form.noUnits')}</p>
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
            {t('stock.transfers.form.addUnits')}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
