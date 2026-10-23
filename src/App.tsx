import WarrantyPage from '@/pages/sales/WarrantyPage';
import WarrantyClaimPage from '@/pages/sales/WarrantyClaimPage';
import WarrantyClaimPrintPage from '@/pages/sales/WarrantyClaimPrintPage';
import SalesHistoryPage from '@/pages/sales/SalesHistoryPage';
import SalesReportPage from '@/pages/reports/SalesReportPage';
import ReturnPage from '@/pages/sales/ReturnPage';
import ReturnsPage from '@/pages/sales/ReturnsPage';
import ReturnDetailPage from '@/pages/sales/ReturnDetailPage';
import EmployeesPage from '@/pages/settings/EmployeesPage';
import SetPasswordPage from '@/pages/auth/SetPasswordPage';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestOnly from '@/components/guards/GuestOnly';
import RequireAuth from '@/components/guards/RequireAuth';
import RequireNavItem from '@/components/guards/RequireNavItem';
import RequirePermission from '@/components/guards/RequirePermission';
import RequirePasswordChanged from '@/components/guards/RequirePasswordChanged';
import RequireShop from '@/components/guards/RequireShop';
import LoginPage from '@/pages/auth/LoginPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import ShopPickerPage from '@/pages/auth/ShopPickerPage';
import AppShell from '@/components/layout/AppShell';
import { navLeaves } from '@/config/navigation';
import DashboardPage from '@/pages/DashboardPage';
import ModulePlaceholderPage from '@/pages/ModulePlaceholderPage';
import NotFoundPage from '@/pages/NotFoundPage';
import RequireSuperAdmin from '@/components/guards/RequireSuperAdmin';
import AdminLayout from '@/components/layout/AdminLayout';
import AdminShopsPage from '@/pages/admin/AdminShopsPage';
import CreateShopPage from '@/pages/admin/CreateShopPage';
import InviteAcceptPage from '@/pages/auth/InviteAcceptPage';
import SubscriptionPage from '@/pages/admin/SubscriptionPage';
import BranchesPage from '@/pages/settings/BranchesPage';
import EtaSettingsPage from '@/pages/settings/EtaSettingsPage';
import DevicesPage from '@/pages/settings/DevicesPage';
import EtaReceiptsPage from '@/pages/tax/EtaReceiptsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import CategoriesPage from '@/pages/inventory/CategoriesPage';
import ProductsPage from '@/pages/inventory/ProductsPage';
import LabelsPage from '@/pages/inventory/LabelsPage';
import StockPage from '@/pages/inventory/StockPage';
import AdjustmentsPage from '@/pages/inventory/AdjustmentsPage';
import CountsPage from '@/pages/inventory/CountsPage';
import CountSheetPage from '@/pages/inventory/CountSheetPage';
import TransfersPage from '@/pages/inventory/TransfersPage';
import TransferPage from '@/pages/inventory/TransferPage';
import UnitsPage from '@/pages/inventory/UnitsPage';
import UnitPage from '@/pages/inventory/UnitPage';
import MovementsPage from '@/pages/inventory/MovementsPage';
import CustomersPage from '@/pages/customers/CustomersPage';
import CustomerPage from '@/pages/customers/CustomerPage';
import CustomerStatementPage from '@/pages/customers/CustomerStatementPage';
import GuarantorPage from '@/pages/customers/GuarantorPage';
import CreditExceptionsPage from '@/pages/customers/CreditExceptionsPage';
import SurveysPage from '@/pages/surveys/SurveysPage';
import SurveyPage from '@/pages/surveys/SurveyPage';
import SurveyFillPage from '@/pages/surveys/SurveyFillPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import SupplierStatementPage from '@/pages/suppliers/SupplierStatementPage';
import VaultsPage from '@/pages/accounting/VaultsPage';
import VaultLedgerPage from '@/pages/accounting/VaultLedgerPage';
import ShiftsPage from '@/pages/accounting/ShiftsPage';
import DayClosesPage from '@/pages/accounting/DayClosesPage';
import DayClosePage from '@/pages/accounting/DayClosePage';
import PairDevicePage from '@/pages/settings/PairDevicePage';
import ExpensesPage from '@/pages/accounting/ExpensesPage';
import PosPage from '@/pages/sales/PosPage';
import SalePage from '@/pages/sales/SalePage';
import ContractPage from '@/pages/installments/ContractPage';
import ContractPrintPage from '@/pages/installments/ContractPrintPage';
import CollectionsPage from '@/pages/collections/CollectionsPage';
import CollectPage from '@/pages/collections/CollectPage';
import CollectionReceiptPage from '@/pages/collections/CollectionReceiptPage';
import OverduePage from '@/pages/installments/OverduePage';
import ContractChangesPage from '@/pages/installments/ContractChangesPage';
import FieldHomePage from '@/pages/collections/FieldHomePage';
import WalletsPage from '@/pages/installments/WalletsPage';
import WalletPage from '@/pages/installments/WalletPage';
import ShiftPage from '@/pages/accounting/ShiftPage';
import PurchaseInvoicesPage from '@/pages/purchasing/PurchaseInvoicesPage';
import PurchaseInvoicePage from '@/pages/purchasing/PurchaseInvoicePage';
import PurchaseInvoiceFormPage from '@/pages/purchasing/PurchaseInvoiceFormPage';
import PurchaseApprovalsPage from '@/pages/purchasing/PurchaseApprovalsPage';
import DiscountApprovalsPage from '@/pages/sales/DiscountApprovalsPage';
import PurchaseReturnsPage from '@/pages/purchasing/PurchaseReturnsPage';
import PurchaseReturnPage from '@/pages/purchasing/PurchaseReturnPage';
import PurchaseReturnFormPage from '@/pages/purchasing/PurchaseReturnFormPage';
import SupplierPaymentsPage from '@/pages/purchasing/SupplierPaymentsPage';
import SupplierPaymentPage from '@/pages/purchasing/SupplierPaymentPage';
import SupplierPaymentFormPage from '@/pages/purchasing/SupplierPaymentFormPage';
import PurchaseOrdersPage from '@/pages/purchasing/PurchaseOrdersPage';
import PurchaseOrderPage from '@/pages/purchasing/PurchaseOrderPage';
import PurchaseOrderFormPage from '@/pages/purchasing/PurchaseOrderFormPage';
import ShopProfilePage from '@/pages/settings/ShopProfilePage';
import OnboardingWizardPage from '@/pages/OnboardingWizardPage';
import ImportPage from '@/pages/settings/ImportPage';
import MigrationPage from '@/pages/settings/MigrationPage';
import ExportPage from '@/pages/settings/ExportPage';

// Dev-only living style guide; never reachable in production builds.
const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));
// Dev-only F09 reference page and a route that needs a permission, to prove the guard.
const SamplePage = lazy(() => import('@/pages/SamplePage'));
const RestrictedSamplePage = lazy(() => import('@/pages/RestrictedSamplePage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));

/** Menu items that have a real page (no placeholder route). */
const REAL_ROUTES = new Set([
  '/dashboard',
  '/audit',
  '/settings',
  '/settings/profile',
  '/settings/branches',
  '/settings/eta',
  '/settings/devices',
  '/settings/import',
  '/settings/migration',
  '/settings/export',
  '/settings/employees',
  '/employees',
  '/inventory/categories',
  '/inventory/products',
  '/inventory/labels',
  '/inventory/stock',
  '/inventory/adjustments',
  '/inventory/counts',
  '/inventory/transfers',
  '/inventory/units',
  '/inventory/movements',
  '/suppliers',
  '/customers',
  '/customers/credit-exceptions',
  '/customers/surveys',
  '/collections',
  '/installments/overdue',
  '/installments/changes',
  '/field',
  '/installments/wallets',
  '/purchasing/invoices',
  '/purchasing/approvals',
  '/purchasing/returns',
  '/purchasing/payments',
  '/purchasing/orders',
  '/accounting/vaults',
  '/accounting/shifts',
  '/accounting/expenses',
  '/accounting/day-close',
  '/sales/pos',
]);
/** U01: the suppliers pages follow the menu item's rule (roles OWNER, BRANCH_MANAGER, WAREHOUSE,
 * ACCOUNTANT); the server checks the purchasing read keys on every call (D53). */
const SUPPLIERS_ITEM = navLeaves().find((i) => i.id === 'suppliers')!;
/** R01: the customers pages follow the menu item's rule; the server checks the customer read keys
 * and masks national IDs without customer.view_pii on every call (D62). */
const CUSTOMERS_ITEM = navLeaves().find((i) => i.id === 'customers')!;
/** R05: the survey pages follow their menu item (any of the three survey keys); the server checks
 * every call and gives a collector only the surveys assigned to them (D75). */
const SURVEYS_ITEM = navLeaves().find((i) => i.id === 'surveys')!;
/** N03: the collection pages follow their menu item (either collection key); the server checks
 * every call (D78). */
const COLLECTIONS_ITEM = navLeaves().find((i) => i.id === 'collections')!;
/** N04: the overdue page follows its menu item (overdue.view); the server checks every call (D79). */
const OVERDUE_ITEM = navLeaves().find((i) => i.id === 'overdue')!;
const CONTRACT_CHANGES_ITEM = navLeaves().find((i) => i.id === 'contract-changes')!;
/** N06: the collector's home and the wallets pages follow their menu items; the server checks every call (D81). */
const FIELD_ITEM = navLeaves().find((i) => i.id === 'field')!;
const WALLETS_ITEM = navLeaves().find((i) => i.id === 'wallets')!;
/** U02: the purchase invoice pages follow their menu item (same roles as purchasing). */
const PURCHASE_INVOICES_ITEM = navLeaves().find((i) => i.id === 'purchase-invoices')!;
/** U04: the purchase return pages follow their menu item (same roles as purchasing). */
const PURCHASE_RETURNS_ITEM = navLeaves().find((i) => i.id === 'purchase-returns')!;
/** U03: the supplier payment pages follow their menu item (same roles as purchasing). */
const SUPPLIER_PAYMENTS_ITEM = navLeaves().find((i) => i.id === 'supplier-payments')!;
/** U05: the purchase order pages follow their menu item (same roles as purchasing). */
const PURCHASE_ORDERS_ITEM = navLeaves().find((i) => i.id === 'purchase-orders')!;
/** K02: the shift pages follow their menu item (shift.operate, or the accountant's history). */
const SHIFTS_ITEM = navLeaves().find((i) => i.id === 'shifts')!;
/** K03: the expenses page follows its menu item (expense.create). */
const EXPENSES_ITEM = navLeaves().find((i) => i.id === 'expenses')!;
/** K04: the day-close pages follow their menu item (day.close or cash.view); the server checks
 * every call and the branch access (D84). */
const DAY_CLOSE_ITEM = navLeaves().find((i) => i.id === 'day-close')!;
/** M02: the migration page follows its menu item (import.data or report.financial); the server
 * checks every call (D85). */
const MIGRATION_ITEM = navLeaves().find((i) => i.id === 'settings-migration')!;
/** S01: the sale screen follows its menu item (sale.create). */
const POS_ITEM = navLeaves().find((i) => i.id === 'pos')!;
const WARRANTY_ITEM = navLeaves().find((i) => i.id === 'sales-warranty')!;
const HISTORY_ITEM = navLeaves().find((i) => i.id === 'sales-history')!;
const SALES_REPORT_ITEM = navLeaves().find((i) => i.id === 'sales-report')!;
const RETURNS_ITEM = navLeaves().find((i) => i.id === 'sales-returns')!;

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Signed-out only */}
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}

          {/* Emailed recovery link landing: reachable regardless of session */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/password/set" element={<SetPasswordPage />} />
          <Route path="/invite/accept" element={<InviteAcceptPage />} />

          {/* Signed-in */}
          <Route element={<RequireAuth />}>
            <Route element={<RequireSuperAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminShopsPage />} />
                <Route path="/admin/shops/new" element={<CreateShopPage />} />
                <Route path="/admin/shops/:id" element={<SubscriptionPage />} />
              </Route>
            </Route>
            {/* A login with several shops picks one here (no shop is active yet) */}
            <Route path="/select-shop" element={<ShopPickerPage />} />

            <Route element={<RequireShop />}>
              {/* The gate: the only page a temp-password user may see */}
              <Route path="/change-password" element={<ChangePasswordPage />} />

              <Route element={<RequirePasswordChanged />}>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/onboarding" element={<OnboardingWizardPage />} />
                  <Route element={<RequirePermission permission="employee.manage" />}>
                    <Route path="/settings/employees" element={<EmployeesPage />} />
                    <Route
                      path="/employees"
                      element={<Navigate to="/settings/employees" replace />}
                    />
                  </Route>
                  <Route element={<RequirePermission permission="org.settings_manage" />}>
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="org.profile_manage" />}>
                    <Route path="/settings/profile" element={<ShopProfilePage />} />
                  </Route>
                  <Route element={<RequirePermission permission="branch.manage" />}>
                    <Route path="/settings/branches" element={<BranchesPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="org.settings_manage" />}>
                    <Route path="/settings/eta" element={<EtaSettingsPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="fiscal.view" />}>
                    <Route path="/tax/eta-receipts" element={<EtaReceiptsPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="device.manage" />}>
                    <Route path="/settings/devices" element={<DevicesPage />} />
                  </Route>
                  {/* M01: the server checks import.data (and the kind's own keys) on every call. */}
                  <Route element={<RequirePermission permission="import.data" />}>
                    <Route path="/settings/import" element={<ImportPage />} />
                  </Route>
                  {/* M03: export.data works in an expired shop; the server checks every call. */}
                  <Route element={<RequirePermission permission="export.data" />}>
                    <Route path="/settings/export" element={<ExportPage />} />
                  </Route>
                  <Route
                    path="/settings/migration"
                    element={
                      <RequireNavItem item={MIGRATION_ITEM}>
                        <MigrationPage />
                      </RequireNavItem>
                    }
                  />
                  {/* O03: any employee may type a pairing code; the server checks shift.operate
                      or device.manage. */}
                  <Route path="/device/pair" element={<PairDevicePage />} />
                  <Route path="/inventory/categories" element={<CategoriesPage />} />
                  <Route path="/inventory/products" element={<ProductsPage />} />
                  <Route path="/inventory/labels" element={<LabelsPage />} />
                  <Route element={<RequirePermission permission="stock.view" />}>
                    <Route path="/inventory/stock" element={<StockPage />} />
                    <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
                    <Route path="/inventory/transfers" element={<TransfersPage />} />
                    <Route path="/inventory/transfers/:id" element={<TransferPage />} />
                    <Route path="/inventory/units" element={<UnitsPage />} />
                    <Route path="/inventory/units/:id" element={<UnitPage />} />
                    <Route path="/inventory/movements" element={<MovementsPage />} />
                  </Route>
                  <Route
                    path="/customers"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <CustomersPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/credit-exceptions"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <CreditExceptionsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/surveys"
                    element={
                      <RequireNavItem item={SURVEYS_ITEM}>
                        <SurveysPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/surveys/:id"
                    element={
                      <RequireNavItem item={SURVEYS_ITEM}>
                        <SurveyPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/surveys/:id/fill"
                    element={
                      <RequireNavItem item={SURVEYS_ITEM}>
                        <SurveyFillPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/guarantors/:id"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <GuarantorPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/:id/statement"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <CustomerStatementPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/collections"
                    element={
                      <RequireNavItem item={COLLECTIONS_ITEM}>
                        <CollectionsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/collections/new"
                    element={
                      <RequireNavItem item={COLLECTIONS_ITEM}>
                        <CollectPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/collections/:id"
                    element={
                      <RequireNavItem item={COLLECTIONS_ITEM}>
                        <CollectionReceiptPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/installments/overdue"
                    element={
                      <RequireNavItem item={OVERDUE_ITEM}>
                        <OverduePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/installments/changes"
                    element={
                      <RequireNavItem item={CONTRACT_CHANGES_ITEM}>
                        <ContractChangesPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/field"
                    element={
                      <RequireNavItem item={FIELD_ITEM}>
                        <FieldHomePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/installments/wallets"
                    element={
                      <RequireNavItem item={WALLETS_ITEM}>
                        <WalletsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/installments/wallets/:id"
                    element={
                      <RequireNavItem item={WALLETS_ITEM}>
                        <WalletPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/contracts/:id/print"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <ContractPrintPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/contracts/:id"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <ContractPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/customers/:id"
                    element={
                      <RequireNavItem item={CUSTOMERS_ITEM}>
                        <CustomerPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/suppliers"
                    element={
                      <RequireNavItem item={SUPPLIERS_ITEM}>
                        <SuppliersPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/invoices"
                    element={
                      <RequireNavItem item={PURCHASE_INVOICES_ITEM}>
                        <PurchaseInvoicesPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/invoices/new"
                    element={
                      <RequireNavItem item={PURCHASE_INVOICES_ITEM}>
                        <PurchaseInvoiceFormPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/invoices/:id"
                    element={
                      <RequireNavItem item={PURCHASE_INVOICES_ITEM}>
                        <PurchaseInvoicePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/invoices/:id/edit"
                    element={
                      <RequireNavItem item={PURCHASE_INVOICES_ITEM}>
                        <PurchaseInvoiceFormPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/suppliers/:id"
                    element={
                      <RequireNavItem item={SUPPLIERS_ITEM}>
                        <SupplierStatementPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/shifts"
                    element={
                      <RequireNavItem item={SHIFTS_ITEM}>
                        <ShiftsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/sales/pos"
                    element={
                      <RequireNavItem item={POS_ITEM}>
                        <PosPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/sales/warranty"
                    element={
                      <RequireNavItem item={WARRANTY_ITEM}>
                        <WarrantyPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/warranty/claims/:id"
                    element={
                      <RequireNavItem item={WARRANTY_ITEM}>
                        <WarrantyClaimPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/warranty/claims/:id/print"
                    element={
                      <RequireNavItem item={WARRANTY_ITEM}>
                        <WarrantyClaimPrintPage />
                      </RequireNavItem>
                    }
                  />
                  {/* S01: a sale's details; the server decides who may read it (D62). */}
                  <Route
                    path="/sales/history"
                    element={
                      <RequireNavItem item={HISTORY_ITEM}>
                        <SalesHistoryPage />
                      </RequireNavItem>
                    }
                  />
                  {/* D02 (D89): the sales and margin report; the server checks report.view and report.financial. */}
                  <Route
                    path="/reports/sales"
                    element={
                      <RequireNavItem item={SALES_REPORT_ITEM}>
                        <SalesReportPage />
                      </RequireNavItem>
                    }
                  />
                  {/* S05 (D88): returns; the server checks refund.create and the branch. */}
                  <Route
                    path="/sales/returns"
                    element={
                      <RequireNavItem item={RETURNS_ITEM}>
                        <ReturnsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/sales/returns/:id"
                    element={
                      <RequireNavItem item={RETURNS_ITEM}>
                        <ReturnDetailPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/sales/:id/return"
                    element={
                      <RequireNavItem item={RETURNS_ITEM}>
                        <ReturnPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/sales/:id"
                    element={
                      <RequireNavItem item={HISTORY_ITEM}>
                        <SalePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/expenses"
                    element={
                      <RequireNavItem item={EXPENSES_ITEM}>
                        <ExpensesPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/day-close"
                    element={
                      <RequireNavItem item={DAY_CLOSE_ITEM}>
                        <DayClosesPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/day-close/closed/:id"
                    element={
                      <RequireNavItem item={DAY_CLOSE_ITEM}>
                        <DayClosePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/day-close/:branchId/:date"
                    element={
                      <RequireNavItem item={DAY_CLOSE_ITEM}>
                        <DayClosePage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/accounting/shifts/:id"
                    element={
                      <RequireNavItem item={SHIFTS_ITEM}>
                        <ShiftPage />
                      </RequireNavItem>
                    }
                  />
                  {/* K01: vaults and their ledgers need cash.view (D56). */}
                  <Route element={<RequirePermission permission="cash.view" />}>
                    <Route path="/accounting/vaults" element={<VaultsPage />} />
                    <Route path="/accounting/vaults/:id" element={<VaultLedgerPage />} />
                  </Route>
                  <Route
                    path="/purchasing/returns"
                    element={
                      <RequireNavItem item={PURCHASE_RETURNS_ITEM}>
                        <PurchaseReturnsPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/returns/:id"
                    element={
                      <RequireNavItem item={PURCHASE_RETURNS_ITEM}>
                        <PurchaseReturnPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/orders"
                    element={
                      <RequireNavItem item={PURCHASE_ORDERS_ITEM}>
                        <PurchaseOrdersPage />
                      </RequireNavItem>
                    }
                  />
                  {/* U05: ordering needs purchase.order_manage (D59); /new before /:id. */}
                  <Route element={<RequirePermission permission="purchase.order_manage" />}>
                    <Route path="/purchasing/orders/new" element={<PurchaseOrderFormPage />} />
                    <Route path="/purchasing/orders/:id/edit" element={<PurchaseOrderFormPage />} />
                  </Route>
                  <Route
                    path="/purchasing/orders/:id"
                    element={
                      <RequireNavItem item={PURCHASE_ORDERS_ITEM}>
                        <PurchaseOrderPage />
                      </RequireNavItem>
                    }
                  />
                  <Route
                    path="/purchasing/payments"
                    element={
                      <RequireNavItem item={SUPPLIER_PAYMENTS_ITEM}>
                        <SupplierPaymentsPage />
                      </RequireNavItem>
                    }
                  />
                  {/* U03: paying a supplier needs supplier.payment_create (D58); before /:id. */}
                  <Route element={<RequirePermission permission="supplier.payment_create" />}>
                    <Route path="/purchasing/payments/new" element={<SupplierPaymentFormPage />} />
                  </Route>
                  <Route
                    path="/purchasing/payments/:id"
                    element={
                      <RequireNavItem item={SUPPLIER_PAYMENTS_ITEM}>
                        <SupplierPaymentPage />
                      </RequireNavItem>
                    }
                  />
                  {/* U04: returning goods needs purchase.return_create (D57). */}
                  <Route element={<RequirePermission permission="purchase.return_create" />}>
                    <Route
                      path="/purchasing/invoices/:id/return"
                      element={<PurchaseReturnFormPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission permission="purchase.invoice_approve" />}>
                    <Route path="/purchasing/approvals" element={<PurchaseApprovalsPage />} />
                  </Route>
                  {/* S03: a manager decides over-cap discount requests (D65). */}
                  <Route element={<RequirePermission permission="discount.above_cap" />}>
                    <Route path="/sales/approvals" element={<DiscountApprovalsPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="stock.count" />}>
                    <Route path="/inventory/counts" element={<CountsPage />} />
                    <Route path="/inventory/counts/:id" element={<CountSheetPage />} />
                  </Route>
                  {import.meta.env.DEV && <Route path="/sample" element={<SamplePage />} />}
                  {import.meta.env.DEV && (
                    <Route element={<RequirePermission permission="audit.view" />}>
                      <Route path="/sample/restricted" element={<RestrictedSamplePage />} />
                    </Route>
                  )}
                  {/* F07: typing the URL without audit.view shows the 403 page. */}
                  <Route element={<RequirePermission permission="audit.view" />}>
                    <Route path="/audit" element={<AuditPage />} />
                  </Route>
                  {/* Real modules replace these placeholders (one route per menu item) */}
                  {navLeaves()
                    .filter((i) => i.to && !REAL_ROUTES.has(i.to))
                    .map((i) => (
                      <Route
                        key={i.id}
                        path={i.to}
                        element={
                          <RequireNavItem item={i}>
                            <ModulePlaceholderPage />
                          </RequireNavItem>
                        }
                      />
                    ))}
                  {/* Any other address inside the app: a 404 with the menu still around it */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
