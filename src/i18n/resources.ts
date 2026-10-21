import arEmployees from './locales/ar/employees.json';
import enEmployees from './locales/en/employees.json';
import arAudit from './locales/ar/audit.json';
import arBranches from './locales/ar/branches.json';
import enBranches from './locales/en/branches.json';
import arSettings from './locales/ar/settings.json';
import enSettings from './locales/en/settings.json';
import arShops from './locales/ar/shops.json';
import arSubscriptions from './locales/ar/subscriptions.json';
import enSubscriptions from './locales/en/subscriptions.json';
import enShops from './locales/en/shops.json';
import arAuth from './locales/ar/auth.json';
import arCommon from './locales/ar/common.json';
import arErrors from './locales/ar/errors.json';
import arForm from './locales/ar/form.json';
import arNav from './locales/ar/nav.json';
import arSample from './locales/ar/sample.json';
import arShell from './locales/ar/shell.json';
import arTable from './locales/ar/table.json';
import arUi from './locales/ar/ui.json';
import enAudit from './locales/en/audit.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enForm from './locales/en/form.json';
import enNav from './locales/en/nav.json';
import enSample from './locales/en/sample.json';
import enShell from './locales/en/shell.json';
import enTable from './locales/en/table.json';
import enUi from './locales/en/ui.json';
import arCategories from './locales/ar/categories.json';
import enCategories from './locales/en/categories.json';
import arProducts from './locales/ar/products.json';
import enProducts from './locales/en/products.json';
import arLabels from './locales/ar/labels.json';
import enLabels from './locales/en/labels.json';
import arStock from './locales/ar/stock.json';
import enStock from './locales/en/stock.json';
import arOnboarding from './locales/ar/onboarding.json';
import enOnboarding from './locales/en/onboarding.json';
import arSuppliers from './locales/ar/suppliers.json';
import enSuppliers from './locales/en/suppliers.json';
import arPurchases from './locales/ar/purchases.json';
import enPurchases from './locales/en/purchases.json';
import arCash from './locales/ar/cash.json';
import enCash from './locales/en/cash.json';
import arSales from './locales/ar/sales.json';
import enSales from './locales/en/sales.json';
import arCustomers from './locales/ar/customers.json';
import enCustomers from './locales/en/customers.json';
import arGuarantors from './locales/ar/guarantors.json';
import arCredit from './locales/ar/credit.json';
import enGuarantors from './locales/en/guarantors.json';
import enCredit from './locales/en/credit.json';
import arCustomerAccount from './locales/ar/customerAccount.json';
import arSurveys from './locales/ar/surveys.json';
import enCustomerAccount from './locales/en/customerAccount.json';
import enSurveys from './locales/en/surveys.json';
import arEta from './locales/ar/eta.json';
import enEta from './locales/en/eta.json';
import arDevices from './locales/ar/devices.json';
import enDevices from './locales/en/devices.json';
import arFiscal from './locales/ar/fiscal.json';
import enFiscal from './locales/en/fiscal.json';
import arReceipts from './locales/ar/receipts.json';
import enReceipts from './locales/en/receipts.json';
import arInstallments from './locales/ar/installments.json';
import enInstallments from './locales/en/installments.json';
import arCollections from './locales/ar/collections.json';
import enCollections from './locales/en/collections.json';
import arOverdue from './locales/ar/overdue.json';
import enOverdue from './locales/en/overdue.json';
import arContractChanges from './locales/ar/contractChanges.json';
import enContractChanges from './locales/en/contractChanges.json';
import arWallets from './locales/ar/wallets.json';
import arContractDocuments from './locales/ar/contractDocuments.json';
import enWallets from './locales/en/wallets.json';
import enContractDocuments from './locales/en/contractDocuments.json';
import arImports from './locales/ar/imports.json';
import arExports from './locales/ar/exports.json';
import arMigration from './locales/ar/migration.json';
import enImports from './locales/en/imports.json';
import enExports from './locales/en/exports.json';
import enMigration from './locales/en/migration.json';
import arDayClose from './locales/ar/dayClose.json';
import arDashboard from './locales/ar/dashboard.json';
import enDayClose from './locales/en/dayClose.json';
import enDashboard from './locales/en/dashboard.json';

/** One JSON file per namespace and language. The first segment of a key is its namespace. */
export const ar = {
  employees: arEmployees,
  branches: arBranches,
  settings: arSettings,
  common: arCommon,
  errors: arErrors,
  auth: arAuth,
  nav: arNav,
  shell: arShell,
  ui: arUi,
  form: arForm,
  table: arTable,
  sample: arSample,
  audit: arAudit,
  shops: arShops,
  subscriptions: arSubscriptions,
  categories: arCategories,
  products: arProducts,
  labels: arLabels,
  stock: arStock,
  onboarding: arOnboarding,
  suppliers: arSuppliers,
  purchases: arPurchases,
  cash: arCash,
  sales: arSales,
  customers: arCustomers,
  guarantors: arGuarantors,
  credit: arCredit,
  customerAccount: arCustomerAccount,
  surveys: arSurveys,
  eta: arEta,
  devices: arDevices,
  fiscal: arFiscal,
  receipts: arReceipts,
  installments: arInstallments,
  collections: arCollections,
  overdue: arOverdue,
  contractChanges: arContractChanges,
  wallets: arWallets,
  contractDocuments: arContractDocuments,
  imports: arImports,
  migration: arMigration,
  exports: arExports,
  dayClose: arDayClose,
  dashboard: arDashboard,
};

/** English must have exactly the shape of Arabic (checked here and by a key-parity test). */
type SameShape<T> = { [K in keyof T]: T[K] extends string ? string : SameShape<T[K]> };
export const en: SameShape<typeof ar> = {
  employees: enEmployees,
  branches: enBranches,
  settings: enSettings,
  common: enCommon,
  errors: enErrors,
  auth: enAuth,
  nav: enNav,
  shell: enShell,
  ui: enUi,
  form: enForm,
  table: enTable,
  sample: enSample,
  audit: enAudit,
  shops: enShops,
  subscriptions: enSubscriptions,
  categories: enCategories,
  products: enProducts,
  labels: enLabels,
  stock: enStock,
  onboarding: enOnboarding,
  suppliers: enSuppliers,
  purchases: enPurchases,
  cash: enCash,
  sales: enSales,
  customers: enCustomers,
  guarantors: enGuarantors,
  credit: enCredit,
  customerAccount: enCustomerAccount,
  surveys: enSurveys,
  eta: enEta,
  devices: enDevices,
  fiscal: enFiscal,
  receipts: enReceipts,
  installments: enInstallments,
  collections: enCollections,
  overdue: enOverdue,
  contractChanges: enContractChanges,
  wallets: enWallets,
  contractDocuments: enContractDocuments,
  imports: enImports,
  migration: enMigration,
  exports: enExports,
  dayClose: enDayClose,
  dashboard: enDashboard,
};

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every translation key, e.g. `auth.login.title`. */
export type TranslationKey = Leaves<typeof ar>;
export type Namespace = keyof typeof ar;
