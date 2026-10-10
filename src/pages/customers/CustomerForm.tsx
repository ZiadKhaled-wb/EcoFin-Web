import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_MAX_PHONES,
  CustomerCreateBody,
  CustomerNationalIdTakenDetail,
  CustomerUpdateBody,
  compareMoney,
  normalizeNationalId,
  parseNationalId,
  type Customer,
  type CustomerCreateInput,
  type CustomerUpdateInput,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatNumber } from '@/lib/format';
import { customersApi } from '@/services/customersApi';
import { t, type TranslationKey } from '@/i18n';
import { CUSTOMER_API_ERRORS, ageOn, governorateName } from './customerShared';

interface FormState {
  full_name: string;
  phones: string[];
  national_id: string;
  address: string;
  city: string;
  job: string;
  employer: string;
  monthly_income: string;
  is_business: boolean;
  tax_registration_no: string;
  notes: string;
}
type Field = keyof FormState;
type FieldErrors = Partial<Record<Field, string>>;
const TEXT_FIELDS = ['address', 'city', 'job', 'employer', 'tax_registration_no', 'notes'] as const;

const FIELD_ERRORS: Record<Field, TranslationKey> = {
  full_name: 'customers.errors.fullName',
  phones: 'customers.errors.phones',
  national_id: 'customers.errors.nationalId',
  address: 'customers.errors.address',
  city: 'customers.errors.city',
  job: 'customers.errors.job',
  employer: 'customers.errors.employer',
  monthly_income: 'customers.errors.monthlyIncome',
  is_business: 'customers.errors.taxNo',
  tax_registration_no: 'customers.errors.taxNo',
  notes: 'customers.errors.notes',
};

function initial(customer: Customer | null): FormState {
  return {
    full_name: customer?.full_name ?? '',
    phones: customer?.phones.length ? customer.phones : [''],
    // The full number is only here for a user with customer.view_pii; a mask is never put in the field.
    national_id: customer?.national_id ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
    job: customer?.job ?? '',
    employer: customer?.employer ?? '',
    monthly_income: customer?.monthly_income ?? '',
    is_business: customer?.is_business ?? false,
    tax_registration_no: customer?.tax_registration_no ?? '',
    notes: customer?.notes ?? '',
  };
}

/**
 * The form as a create body; empty optional fields are left out (the server keeps null).
 * `idLocked`: the customer has an ID this user may not see, so it is not part of the body.
 * Birth date, gender and governorate are never sent: the server reads them from the national ID.
 */
function toInput(f: FormState, idLocked: boolean): CustomerCreateInput {
  const body: CustomerCreateInput = {
    full_name: f.full_name,
    phones: f.phones.filter((p) => p.trim() !== ''),
    is_business: f.is_business,
  };
  if (!idLocked && f.national_id.trim() !== '') body.national_id = f.national_id;
  for (const key of TEXT_FIELDS) if (f[key].trim()) body[key] = f[key];
  if (f.monthly_income.trim()) body.monthly_income = f.monthly_income.trim();
  return body;
}

function fieldErrors(issues: { path: (string | number)[] }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '') as Field;
    if (key in FIELD_ERRORS) out[key] = t(FIELD_ERRORS[key]);
  }
  return out;
}

const sameMoney = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : compareMoney(a, b) === 0;

/** What changed, compared after the contract's normalisation (null = empty). */
function changesOf(
  next: CustomerCreateBody,
  customer: Customer,
  idLocked: boolean,
): CustomerUpdateInput {
  const changes: CustomerUpdateInput = {};
  if (next.full_name !== customer.full_name) changes.full_name = next.full_name;
  if (next.phones.join('|') !== customer.phones.join('|')) changes.phones = next.phones;
  if (next.is_business !== customer.is_business) changes.is_business = next.is_business;
  for (const key of TEXT_FIELDS) {
    const value = next[key] ?? null;
    if (value !== customer[key]) changes[key] = value;
  }
  const income = next.monthly_income ?? null;
  if (!sameMoney(income, customer.monthly_income)) changes.monthly_income = income;
  if (!idLocked) {
    const nationalId = next.national_id ?? null;
    if (nationalId !== customer.national_id) changes.national_id = nationalId;
  }
  return changes;
}

/** Mount it per opening (a new key): the form state starts from the customer each time. */
export interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add. */
  customer: Customer | null;
  onSaved: (customer: Customer) => void;
}

/**
 * R01 (D62) add / edit. The national ID is validated and parsed while typing (birth date, age,
 * gender, governorate), as the old CRM screen did; none of them is typed. A saved ID can only be changed by a user who
 * may see it (customer.view_pii); everyone else sees its last four digits, read-only.
 */
export default function CustomerForm({ open, onOpenChange, customer, onSaved }: CustomerFormProps) {
  const canSeePii = useCan('customer.view_pii');
  const [form, setForm] = useState<FormState>(() => initial(customer));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [takenBy, setTakenBy] = useState<CustomerNationalIdTakenDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends Field>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setPhone = (index: number, value: string) =>
    set(
      'phones',
      form.phones.map((p, i) => (i === index ? value : p)),
    );

  const savedMask = customer?.national_id_masked ?? null;
  const idLocked = savedMask !== null && !canSeePii;
  const typedId = normalizeNationalId(form.national_id);
  const parsedId = idLocked ? null : parseNationalId(typedId);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setTakenBy(null);
    // The contract trims, normalises phones and the ID, and applies the limits.
    const parsed = CustomerCreateBody.safeParse(toInput(form, idLocked));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setFormError(t('customers.errors.validation'));
      return;
    }
    try {
      let saved: Customer;
      if (!customer) {
        setSaving(true);
        saved = await customersApi.create(parsed.data);
      } else {
        const changes = changesOf(parsed.data, customer, idLocked);
        if (Object.keys(changes).length === 0) {
          onOpenChange(false);
          return;
        }
        setSaving(true);
        saved = await customersApi.update(customer.id, CustomerUpdateBody.parse(changes));
      }
      notify.success(t('customers.saved'));
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'CUSTOMER_NATIONAL_ID_TAKEN') {
        const detail = CustomerNationalIdTakenDetail.safeParse(
          err instanceof ApiError ? err.details : undefined,
        );
        setErrors({ national_id: t('customers.errors.nationalIdTaken') });
        setTakenBy(detail.success ? detail.data : null);
      } else if (code === 'PERMISSION_DENIED' && savedMask !== null) {
        setErrors({ national_id: t('customers.errors.nationalIdPermission') });
      } else setFormError(t(CUSTOMER_API_ERRORS[code] ?? 'customers.errors.failed'));
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = 'type-label mb-3';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(customer ? 'customers.edit' : 'customers.add')}
      className="max-w-3xl!"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-6" noValidate>
        <section aria-labelledby="customer-identity">
          <h3 id="customer-identity" className={sectionTitle}>
            {t('customers.sections.identity')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('customers.fields.fullName')}
              placeholder={t('customers.fields.fullNamePlaceholder')}
              value={form.full_name}
              maxLength={150}
              required
              error={errors.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
            {idLocked ? (
              <FormField
                label={t('customers.fields.nationalId')}
                ltr
                value={savedMask}
                readOnly
                help={t('customers.fields.nationalIdLocked')}
                error={errors.national_id}
              />
            ) : (
              <FormField
                label={t('customers.fields.nationalId')}
                ltr
                inputMode="numeric"
                autoComplete="off"
                value={form.national_id}
                maxLength={20}
                help={t(
                  savedMask !== null
                    ? 'customers.fields.nationalIdChangeHint'
                    : 'customers.fields.nationalIdHelp',
                )}
                error={errors.national_id}
                onChange={(e) => set('national_id', e.target.value)}
              />
            )}
          </div>
          {takenBy && (
            <p className="type-caption mt-2" role="status">
              {t('customers.errors.nationalIdTakenBy', { name: takenBy.full_name })}{' '}
              <Link
                to={`/customers/${takenBy.customer_id}`}
                className="text-brand-700 hover:underline"
                onClick={() => onOpenChange(false)}
              >
                {t('customers.errors.openExisting')}
              </Link>
            </p>
          )}
          {parsedId && (
            <dl className="mt-3 grid gap-3 rounded-panel border border-line p-3 sm:grid-cols-4">
              <div>
                <dt className="type-caption">{t('customers.fields.birthDate')}</dt>
                <dd>{formatBusinessDate(parsedId.birth_date)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('customers.fields.age')}</dt>
                <dd>
                  {t('customers.fields.ageYears', {
                    count: formatNumber(ageOn(parsedId.birth_date)),
                  })}
                </dd>
              </div>
              <div>
                <dt className="type-caption">{t('customers.fields.gender')}</dt>
                <dd>{t(`customers.gender.${parsedId.gender}`)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('customers.fields.governorate')}</dt>
                <dd>{governorateName(parsedId.governorate_code)}</dd>
              </div>
            </dl>
          )}
        </section>

        <section aria-labelledby="customer-contact">
          <h3 id="customer-contact" className={sectionTitle}>
            {t('customers.sections.contact')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {form.phones.map((phone, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField
                    label={
                      index === 0
                        ? t('customers.fields.phoneMain')
                        : t('customers.fields.phoneOther', { n: formatNumber(index + 1) })
                    }
                    type="tel"
                    ltr
                    value={phone}
                    maxLength={30}
                    required={index === 0}
                    error={index === 0 ? errors.phones : undefined}
                    invalid={!!errors.phones}
                    onChange={(e) => setPhone(index, e.target.value)}
                  />
                </div>
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('customers.fields.removePhone', { n: formatNumber(index + 1) })}
                    onClick={() =>
                      set(
                        'phones',
                        form.phones.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
          </div>
          {form.phones.length < CUSTOMER_MAX_PHONES && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => set('phones', [...form.phones, ''])}
            >
              {t('customers.fields.addPhone')}
            </Button>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
            <FormField
              label={t('customers.fields.address')}
              value={form.address}
              maxLength={300}
              error={errors.address}
              onChange={(e) => set('address', e.target.value)}
            />
            <FormField
              label={t('customers.fields.city')}
              value={form.city}
              maxLength={100}
              error={errors.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </div>
        </section>

        <section aria-labelledby="customer-work">
          <h3 id="customer-work" className={sectionTitle}>
            {t('customers.sections.work')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              label={t('customers.fields.job')}
              value={form.job}
              maxLength={100}
              error={errors.job}
              onChange={(e) => set('job', e.target.value)}
            />
            <FormField
              label={t('customers.fields.employer')}
              value={form.employer}
              maxLength={150}
              error={errors.employer}
              onChange={(e) => set('employer', e.target.value)}
            />
            <MoneyInput
              label={t('customers.fields.monthlyIncome')}
              value={form.monthly_income}
              error={errors.monthly_income}
              onValueChange={(v) => set('monthly_income', v)}
            />
          </div>
        </section>

        <section aria-labelledby="customer-business">
          <h3 id="customer-business" className={sectionTitle}>
            {t('customers.sections.business')}
          </h3>
          <Checkbox
            label={t('customers.fields.isBusiness')}
            description={t('customers.fields.isBusinessHelp')}
            checked={form.is_business}
            onChange={(e) => set('is_business', e.target.checked)}
          />
          {(form.is_business || form.tax_registration_no !== '') && (
            <div className="mt-2 sm:max-w-sm">
              <FormField
                label={t('customers.fields.taxNo')}
                ltr
                value={form.tax_registration_no}
                maxLength={20}
                required={form.is_business}
                error={errors.tax_registration_no}
                onChange={(e) => set('tax_registration_no', e.target.value)}
              />
            </div>
          )}
        </section>

        <Textarea
          label={t('customers.fields.notes')}
          value={form.notes}
          maxLength={1000}
          rows={3}
          error={errors.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('customers.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('customers.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
