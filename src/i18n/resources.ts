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
};

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every translation key, e.g. `auth.login.title`. */
export type TranslationKey = Leaves<typeof ar>;
export type Namespace = keyof typeof ar;
