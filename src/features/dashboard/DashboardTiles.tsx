import { compareMoney, type OwnerDashboard } from '@ziadkhaled-wb/contracts';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { t } from '@/i18n';
import DashboardTile, { type TileAttention, type TileLine } from './DashboardTile';
import { dashboardLinks as link } from './dashboardLinks';

type Tiles = OwnerDashboard['tiles'];

const isZero = (money: string) => compareMoney(money, '0.00') === 0;
const attentionIf = (condition: boolean, tone: TileAttention): TileAttention | undefined =>
  condition ? tone : undefined;

/**
 * The owner dashboard's tiles (D01, D87). Every value is the server's, formatted only; nothing is
 * added up here. `date` is the shop's business date from the server, `branchId` '' for all
 * branches, `timeZone` the shop's.
 */
export default function DashboardTiles({
  tiles,
  date,
  branchId,
  timeZone,
}: {
  tiles: Tiles;
  date: string;
  branchId: string;
  timeZone: string;
}) {
  const { sales_today, collections_today, cash, open_shifts, overdue, low_stock, eta } = tiles;
  const { unclosed_days, approvals } = tiles;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sales_today && (
        <DashboardTile
          id="sales_today"
          title={t('dashboard.sales.title')}
          value={formatMoney(sales_today.total)}
          to={link.sales(date, branchId)}
          lines={[
            { text: t('dashboard.sales.count', { count: formatNumber(sales_today.count) }) },
            {
              text: t('dashboard.sales.methods', {
                cash: formatMoney(sales_today.paid_by_method.cash),
                bank: formatMoney(sales_today.paid_by_method.bank_transfer),
                credit: formatMoney(sales_today.paid_by_method.store_credit),
              }),
            },
            ...(isZero(sales_today.on_contract)
              ? []
              : [
                  {
                    text: t('dashboard.sales.onContract', {
                      amount: formatMoney(sales_today.on_contract),
                    }),
                  },
                ]),
          ]}
        />
      )}
      {collections_today && (
        <DashboardTile
          id="collections_today"
          title={t('dashboard.collections.title')}
          value={formatMoney(collections_today.total)}
          to={link.collections(date, branchId)}
          lines={[
            {
              text: t('dashboard.collections.count', {
                count: formatNumber(collections_today.count),
              }),
            },
            ...(isZero(collections_today.in_field)
              ? []
              : [
                  {
                    text: t('dashboard.collections.inField', {
                      amount: formatMoney(collections_today.in_field),
                    }),
                  },
                ]),
          ]}
        />
      )}
      {cash && (
        <DashboardTile
          id="cash"
          title={t('dashboard.cash.title')}
          value={formatMoney(cash.total_in_branches)}
          to={link.vaults(branchId)}
          lines={
            [
              {
                text: t('dashboard.cash.safes', { amount: formatMoney(cash.safes) }),
                to: link.vaults(branchId),
              },
              {
                text: t('dashboard.cash.drawers', { amount: formatMoney(cash.drawers) }),
                to: link.openShifts(branchId),
              },
              {
                text: t('dashboard.cash.wallets', { amount: formatMoney(cash.wallets) }),
                to: link.wallets(branchId),
              },
              {
                text: t('dashboard.cash.banks', { amount: formatMoney(cash.banks) }),
                to: link.vaults(branchId),
              },
            ] satisfies TileLine[]
          }
        />
      )}
      {open_shifts && (
        <DashboardTile
          id="open_shifts"
          title={t('dashboard.shifts.title')}
          value={formatNumber(open_shifts.count)}
          to={link.openShifts(branchId)}
          attention={attentionIf(open_shifts.from_earlier_days > 0, 'warning')}
          lines={[
            ...(open_shifts.oldest_opened_at
              ? [
                  {
                    text: t('dashboard.shifts.oldest', {
                      time: formatDateTime(open_shifts.oldest_opened_at, undefined, timeZone),
                    }),
                  },
                ]
              : []),
            ...(open_shifts.from_earlier_days > 0
              ? [
                  {
                    text: t('dashboard.shifts.earlier', {
                      count: formatNumber(open_shifts.from_earlier_days),
                    }),
                  },
                ]
              : []),
          ]}
        />
      )}
      {overdue && (
        <DashboardTile
          id="overdue"
          title={t('dashboard.overdue.title')}
          value={formatMoney(overdue.amount)}
          to={link.overdue(branchId)}
          attention={attentionIf(overdue.contracts > 0, 'danger')}
          lines={[
            {
              text: t('dashboard.overdue.counts', {
                contracts: formatNumber(overdue.contracts),
                customers: formatNumber(overdue.customers),
              }),
            },
          ]}
        />
      )}
      {low_stock && (
        <DashboardTile
          id="low_stock"
          title={t('dashboard.lowStock.title')}
          value={formatNumber(low_stock.products)}
          to={link.lowStock(branchId)}
          attention={attentionIf(low_stock.products > 0, 'warning')}
          lines={[{ text: t('dashboard.lowStock.hint') }]}
        />
      )}
      {eta && (
        <DashboardTile
          id="eta"
          title={t('dashboard.eta.title')}
          value={formatNumber(eta.needs_action)}
          to={link.eta(branchId)}
          attention={attentionIf(eta.needs_action > 0, 'danger')}
          lines={(
            [
              ['blocked', eta.blocked],
              ['send_failed', eta.send_failed],
              ['rejected', eta.rejected],
              ['due_soon', eta.due_soon],
              ['overdue', eta.overdue],
            ] as const
          )
            .filter(([, count]) => count > 0)
            .map(([kind, count]) => ({
              text: t(`dashboard.eta.${kind}`, { count: formatNumber(count) }),
            }))}
        />
      )}
      {unclosed_days && (
        <DashboardTile
          id="unclosed_days"
          title={t('dashboard.unclosed.title')}
          value={formatNumber(unclosed_days.days)}
          to={link.unclosedDays(branchId)}
          attention={attentionIf(unclosed_days.days > 0, 'warning')}
          lines={
            unclosed_days.days > 0
              ? [
                  {
                    text: t('dashboard.unclosed.branches', {
                      count: formatNumber(unclosed_days.branches),
                    }),
                  },
                ]
              : []
          }
        />
      )}
      {approvals && (
        <DashboardTile
          id="approvals"
          title={t('dashboard.approvals.title')}
          value={formatNumber(approvals.total)}
          to={
            approvals.discount !== null
              ? link.discountApprovals()
              : approvals.purchase !== null
                ? link.purchaseApprovals()
                : link.creditExceptions()
          }
          lines={[
            ...(approvals.discount !== null
              ? [
                  {
                    text: t('dashboard.approvals.discount', {
                      count: formatNumber(approvals.discount),
                    }),
                    to: link.discountApprovals(),
                  },
                ]
              : []),
            ...(approvals.purchase !== null
              ? [
                  {
                    text: t('dashboard.approvals.purchase', {
                      count: formatNumber(approvals.purchase),
                    }),
                    to: link.purchaseApprovals(),
                  },
                ]
              : []),
            ...(approvals.credit !== null
              ? [
                  {
                    text: t('dashboard.approvals.credit', {
                      count: formatNumber(approvals.credit),
                    }),
                    to: link.creditExceptions(),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
