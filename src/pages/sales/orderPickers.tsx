import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '@ziadkhaled-wb/contracts';
import Checkbox from '@/components/ui/Checkbox';
import { t } from '@/i18n';
import { productKeys, productsApi } from '@/services/productsApi';
import { useAuthStore } from '@/store/authStore';
import { productName } from './usePosCart';

/** An active product found by name, SKU or barcode text (the quote editor's catalog search). */
export function ProductPicker({
  label,
  value,
  onPick,
}: {
  label: string;
  /** The product chosen so far, shown under the search. */
  value?: Product | null;
  onPick: (product: Product) => void;
}) {
  const [search, setSearch] = useState(''),
    [items, setItems] = useState<Product[]>([]),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (search)
      void productsApi
        .list({ search, status: 'active', pageSize: 20 })
        .then((r) => {
          if (!alive) return;
          setItems(r.items);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    return () => {
      alive = false;
    };
  }, [search]);
  const shown = search ? items : [];
  return (
    <div className="sales-order-picker">
      <label>
        {label}
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {value && (
        <p className="sales-order-muted">
          {t('salesOrders.picker.chosen', { name: productName(value) })}
        </p>
      )}
      {failed && <p role="alert">{t('salesOrders.picker.failed')}</p>}
      {shown.length > 0 && (
        <ul className="sales-order-picker-results">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setSearch('');
                }}
              >
                {productName(p)} <bdi>{p.sku}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Decision 3: the units of a serialized product held for a `from_stock` line. Lists the product's
 * in-stock units at the branch (the POS unit lookup) and lets exactly `quantity` of them be ticked.
 */
export function SerialPicker({
  productId,
  branchId,
  quantity,
  value,
  onChange,
  taken,
}: {
  productId: string;
  /** The order's branch; the units must be in stock there. Empty until a branch is chosen. */
  branchId: string;
  quantity: number;
  value: readonly string[];
  onChange: (unitIds: string[]) => void;
  /** Units another line of the same order already holds. */
  taken?: ReadonlySet<string>;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const units = useQuery({
    queryKey: [...productKeys.units(orgId, productId), 'in_stock'],
    queryFn: () => productsApi.units(productId, 'in_stock'),
    enabled: !!branchId,
  });
  const picked = new Set(value);
  const choices = (units.data ?? []).filter(
    (u) => u.branch_id === branchId && (picked.has(u.id) || !taken?.has(u.id)),
  );
  const full = value.length >= quantity;
  return (
    <fieldset className="sales-order-serials">
      <legend>{t('salesOrders.serials.title', { picked: value.length, quantity })}</legend>
      {!branchId && <p className="sales-order-muted">{t('salesOrders.serials.chooseBranch')}</p>}
      {units.isError && <p role="alert">{t('salesOrders.serials.failed')}</p>}
      {units.data && choices.length === 0 && (
        <p className="sales-order-muted">{t('salesOrders.serials.none')}</p>
      )}
      {choices.map((u) => (
        <Checkbox
          key={u.id}
          label={<span dir="ltr">{u.serial}</span>}
          checked={picked.has(u.id)}
          disabled={!picked.has(u.id) && full}
          onChange={(e) =>
            onChange(e.target.checked ? [...value, u.id] : value.filter((id) => id !== u.id))
          }
        />
      ))}
    </fieldset>
  );
}
