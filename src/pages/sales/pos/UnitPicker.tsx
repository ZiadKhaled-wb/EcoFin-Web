import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product, ProductUnit } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';
import { productKeys, productsApi } from '@/services/productsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from '../usePosCart';
import { focusFirst } from './usePosShortcuts';

/** S01: the serials of a product that can be sold now: in stock, in the branch of the shift, not in the cart. */
export default function UnitPicker({
  product,
  branchId,
  inCart,
  onAdd,
  onClose,
}: {
  product: Product;
  branchId: string;
  /** The units the cart already holds. */
  inCart: ReadonlySet<string>;
  onAdd: (units: ProductUnit[]) => void;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const units = useQuery({
    queryKey: [...productKeys.units(orgId, product.id), 'in_stock'],
    queryFn: () => productsApi.units(product.id, 'in_stock'),
  });
  const choices = (units.data ?? []).filter((u) => u.branch_id === branchId && !inCart.has(u.id));

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('sales.pos.unitsTitle', { name: productName(product) })}
      description={t('sales.pos.unitsHelp')}
    >
      <div className="space-y-3">
        {units.isError && <p role="alert">{t('sales.pos.unitsFailed')}</p>}
        {units.data && choices.length === 0 && (
          <p className="type-caption">{t('sales.pos.noUnits')}</p>
        )}
        {choices.length > 0 && (
          // Mounted once the serials are loaded: the first one takes the focus.
          <div className="space-y-3" ref={focusFirst}>
            {choices.map((u) => (
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
          </div>
        )}
        <Button
          type="button"
          disabled={picked.size === 0}
          onClick={() => onAdd(choices.filter((u) => picked.has(u.id)))}
        >
          {t('sales.pos.addUnits')}
        </Button>
      </div>
    </Dialog>
  );
}
