import {
  amountInWordsAr,
  DEFAULT_CONTRACT_TERMS_AR,
  renderContractTemplate,
  type ContractDocuments,
  type ContractTemplatePlaceholder,
} from '@ziadkhaled-wb/contracts';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';

/**
 * N07 (D82): the words on the printed contract and promissory notes. The documents are Arabic
 * only (whatever language the screen is in), so they live here and not in the locale files.
 * Words: installment price and profit, never interest; nothing about late fees or discounts
 * (docs/ISLAMIC_FINANCE_RULES.md).
 */
export const DOC = {
  contractTitle: 'عقد بيع بالتقسيط',
  noteTitle: 'كمبيالة',
  copy: 'صورة (COPY)',
  contractNo: 'رقم العقد',
  date: 'التاريخ',
  firstParty: 'الطرف الأول (البائع)',
  secondParty: 'الطرف الثاني (المشتري)',
  guarantor: 'ضامن متضامن',
  guarantors: 'الضامنون',
  nationalId: 'الرقم القومي',
  job: 'الوظيفة',
  address: 'العنوان',
  phone: 'الهاتف',
  commercialRegister: 'سجل تجاري',
  taxNo: 'الرقم الضريبي',
  branch: 'الفرع',
  goods: 'السلع المباعة',
  goodName: 'الصنف',
  quantity: 'الكمية',
  price: 'السعر والسداد',
  downPayment: 'الدفعة المقدمة',
  financed: 'المبلغ المقسَّط',
  profit: 'ربح البائع',
  installmentPrice: 'سعر البيع بالتقسيط',
  inWords: 'فقط',
  count: 'عدد الأقساط',
  frequency: 'نظام السداد',
  firstDue: 'أول قسط',
  lastDue: 'آخر قسط',
  schedule: 'جدول الأقساط',
  seq: 'القسط',
  dueDate: 'تاريخ الاستحقاق',
  amount: 'قيمة القسط',
  terms: 'الشروط والأحكام',
  signatures: 'التوقيعات',
  signCustomer: 'الطرف الثاني',
  signShop: 'الطرف الأول',
  signGuarantor: 'ضامن متضامن',
  replaces: (date: string) => `هذا الجدول يحل محل جدول الأقساط المؤرخ ${date}.`,
  notesReplace: (date: string) => `تحل هذه الكمبيالات محل كمبيالات الجدول المؤرخ ${date}.`,
  noteNo: 'رقم الكمبيالة',
  noteDue: 'تستحق في',
  noteBody: (p: {
    drawer: string;
    id: string;
    address: string;
    beneficiary: string;
    amount: string;
    words: string;
    due: string;
    contract: string;
  }) => {
    const who = [p.id ? `الرقم القومي ${p.id}` : '', p.address].filter(Boolean).join('، ');
    return `أتعهد أنا الموقع أدناه ${p.drawer}${who ? ` (${who})` : ''} بأن أدفع بموجب هذه الكمبيالة، دون احتجاج، لأمر ${p.beneficiary} مبلغ ${p.amount} (${p.words}) في ${p.due}، وذلك من ثمن السلع المباعة بالتقسيط بموجب العقد رقم ${p.contract}.`;
  },
  issued: (place: string | null, date: string) =>
    place ? `حررت في ${place} بتاريخ ${date}` : `حررت بتاريخ ${date}`,
  drawer: 'المدين (المحرر)',
  beneficiaryLabel: 'المستفيد',
  cut: '✂ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ',
  page: 'صفحة',
  of: 'من',
  status: { completed: 'مسدد', written_off: 'دين معدوم', returned: 'مرتجع' },
  frequencyName: { monthly: 'شهريًا', weekly: 'أسبوعيًا', daily: 'يوميًا' },
} as const;

/** Money and dates on the paper are always Arabic. */
export const money = (v: string) => formatMoney(v, 'ar');
export const day = (v: string) => formatBusinessDate(v, 'ar');

/** The values the owner's `{{placeholders}}` stand for, taken from the read (nothing computed here). */
export function templateValues(
  docs: ContractDocuments,
): Record<ContractTemplatePlaceholder, string> {
  const { contract: c, customer, shop } = docs;
  return {
    shop_name: shop.name,
    shop_legal_name: shop.legal_name ?? shop.name,
    commercial_register: shop.commercial_register ?? '',
    branch_name: shop.branch.name,
    city: shop.branch.city ?? '',
    contract_number: c.number,
    contract_date: day(c.contract_date),
    customer_name: customer.name,
    customer_national_id: customer.national_id ?? '',
    installment_price: money(c.total_payable),
    installment_price_words: amountInWordsAr(c.total_payable),
    down_payment: money(c.down_payment),
    installments_count: formatNumber(c.installments_count, 'ar'),
    frequency: DOC.frequencyName[c.frequency],
    first_due_date: day(c.first_due_date),
    last_due_date: day(c.last_due_date ?? c.first_due_date),
  };
}

/** The terms as printed: the shop's text, or the default one, with the placeholders filled. */
export function termsText(docs: ContractDocuments): string {
  const source = docs.terms.is_default || docs.terms.text === null ? null : docs.terms.text;
  return renderContractTemplate(source ?? DEFAULT_CONTRACT_TERMS_AR, templateValues(docs));
}
