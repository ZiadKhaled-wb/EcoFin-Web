import type { ContractMigrationSource } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/format';

/**
 * M02: a contract that came from the old system says so: "Migrated · {old number} · paid before
 * {amount}". Nothing is shown for a contract made here.
 */
export function MigratedNote({ source }: { source: ContractMigrationSource | null | undefined }) {
  if (!source) return null;
  return (
    <span className="type-caption block">
      {t('migration.badge.text', {
        ref: source.contract_ref,
        paid: formatMoney(source.paid_before),
      })}
    </span>
  );
}

export function MigratedBadge({ source }: { source: ContractMigrationSource | null | undefined }) {
  if (!source) return null;
  return (
    <Badge tone="neutral">
      {t('migration.badge.text', {
        ref: source.contract_ref,
        paid: formatMoney(source.paid_before),
      })}
    </Badge>
  );
}
