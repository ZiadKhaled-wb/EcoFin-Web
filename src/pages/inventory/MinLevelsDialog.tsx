import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_MIN_STOCK, type BranchMinLevels, type BranchSummary } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import ErrorState from '@/components/ui/ErrorState';
import NumberInput from '@/components/ui/NumberInput';
import { notify } from '@/components/ui/notify';
import Skeleton from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

type BranchLevel = BranchMinLevels['branches'][number];

/** A draft is a whole number from 0 to MAX_MIN_STOCK. */
const parseLevel = (v: string) => {
  const n = Number(v.trim());
  return v.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_MIN_STOCK ? n : null;
};

/**
 * I06 (catalog.manage): a product's min level in each of the caller's branches. A branch's own
 * level wins over the product's and the shop's; "Use default" removes it (D52).
 */
export default function MinLevelsDialog({
  productId,
  name,
  branches,
  onClose,
}: {
  productId: string;
  name: string;
  branches: BranchSummary[];
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const levels = useQuery({
    queryKey: stockKeys.minLevels(orgId, productId),
    queryFn: () => stockApi.minLevels(productId),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  async function save(branchId: string, minStock: number | null) {
    setSaving(branchId);
    try {
      const result = await stockApi.setMinLevel(productId, {
        branch_id: branchId,
        min_stock: minStock,
      });
      cache.setQueryData(stockKeys.minLevels(orgId, productId), result);
      await cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== branchId)));
      notify.success(t(minStock === null ? 'stock.minLevels.cleared' : 'stock.minLevels.saved'));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      notify.error(
        t(
          code === 'BRANCH_DENIED'
            ? 'stock.minLevels.errors.denied'
            : code === 'BRANCH_INACTIVE'
              ? 'stock.minLevels.errors.inactive'
              : 'stock.minLevels.errors.failed',
        ),
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.minLevels.title', { name })}
      description={t('stock.minLevels.description', {
        product: formatNumber(levels.data?.product_min_stock ?? 0),
        shop: formatNumber(levels.data?.shop_min_stock ?? 0),
      })}
      className="max-w-3xl!"
    >
      {levels.isPending ? (
        <Skeleton className="h-24" />
      ) : levels.isError || !levels.data ? (
        <ErrorState
          title={t('stock.minLevels.errors.load')}
          onRetry={() => void levels.refetch()}
        />
      ) : levels.data.branches.length === 0 ? (
        <p className="type-body">{t('stock.minLevels.noBranches')}</p>
      ) : (
        // A plain table: the inputs keep their focus while the drafts change.
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <caption className="sr-only">{t('stock.minLevels.title', { name })}</caption>
            <thead>
              <tr className="type-label border-b border-line">
                <th className="py-2 text-start">{t('stock.minLevels.branch')}</th>
                <th className="py-2 text-end">{t('stock.minLevels.inUse')}</th>
                <th className="py-2 ps-4 text-start">{t('stock.minLevels.own')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {levels.data.branches.map((b) => (
                <LevelRow
                  key={b.branch_id}
                  level={b}
                  branch={branchName.get(b.branch_id) ?? ''}
                  draft={drafts[b.branch_id]}
                  busy={saving === b.branch_id}
                  onDraft={(v) => setDrafts((d) => ({ ...d, [b.branch_id]: v }))}
                  onSave={(v) => void save(b.branch_id, v)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

function LevelRow({
  level,
  branch,
  draft: edited,
  busy,
  onDraft,
  onSave,
}: {
  level: BranchLevel;
  branch: string;
  draft: string | undefined;
  busy: boolean;
  onDraft: (value: string) => void;
  onSave: (value: number | null) => void;
}) {
  const saved = level.min_stock === null ? '' : String(level.min_stock);
  const draft = edited ?? saved;
  const parsed = parseLevel(draft);
  const changed = draft !== saved;
  return (
    <tr>
      <td className="py-2">{branch}</td>
      <td className="py-2 text-end">
        <span className="block">{formatNumber(level.min_level)}</span>
        <span className="type-caption block">{t(`stock.minSource.${level.min_source}`)}</span>
      </td>
      <td className="py-2 ps-4">
        <div className="flex items-start gap-2 [&_.field-label]:sr-only">
          <div className="w-28">
            <NumberInput
              label={t('stock.minLevels.input', { branch })}
              value={draft}
              decimals={0}
              onValueChange={onDraft}
              {...(changed && draft !== '' && parsed === null
                ? { error: t('stock.minLevels.errors.invalid') }
                : {})}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !changed || parsed === null}
            onClick={() => onSave(parsed)}
          >
            {t('stock.minLevels.save')}
          </Button>
          {level.min_stock !== null && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(null)}>
              {t('stock.minLevels.useDefault')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
