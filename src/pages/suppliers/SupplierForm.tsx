import { useState, type FormEvent } from 'react';
import {
  SupplierCreateBody,
  SupplierUpdateBody,
  type Supplier,
  type SupplierCreateInput,
  type SupplierUpdateInput,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import NumberInput from '@/components/ui/NumberInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { suppliersApi } from '@/services/suppliersApi';
import { t, type TranslationKey } from '@/i18n';

interface FormState {
  name: string;
  phone: string;
  tax_registration_no: string;
  address: string;
  payment_terms_days: string;
  notes: string;
}
type Field = keyof FormState;
type FieldErrors = Partial<Record<Field, string>>;

const FIELD_ERRORS: Record<Field, TranslationKey> = {
  name: 'suppliers.errors.name',
  phone: 'suppliers.errors.phone',
  tax_registration_no: 'suppliers.errors.taxNo',
  address: 'suppliers.errors.address',
  payment_terms_days: 'suppliers.errors.terms',
  notes: 'suppliers.errors.notes',
};

const API_ERRORS: Partial<Record<string, TranslationKey>> = {
  SUPPLIER_NOT_FOUND: 'suppliers.errors.notFound',
  PERMISSION_DENIED: 'suppliers.errors.permission',
  VALIDATION_FAILED: 'suppliers.errors.validation',
};

function initial(supplier: Supplier | null): FormState {
  return {
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    tax_registration_no: supplier?.tax_registration_no ?? '',
    address: supplier?.address ?? '',
    payment_terms_days: String(supplier?.payment_terms_days ?? 0),
    notes: supplier?.notes ?? '',
  };
}

/** The form as a create body; empty optional fields are left out (the server keeps null). */
function toInput(f: FormState): SupplierCreateInput {
  const optional = (v: string) => (v.trim() ? v : undefined);
  const body: SupplierCreateInput = {
    name: f.name,
    payment_terms_days: f.payment_terms_days === '' ? 0 : Number(f.payment_terms_days),
  };
  for (const key of ['phone', 'tax_registration_no', 'address', 'notes'] as const) {
    const v = optional(f[key]);
    if (v !== undefined) body[key] = v;
  }
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

/** Mount it per opening (a new key): the form state starts from the supplier each time. */
export interface SupplierFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add. */
  supplier: Supplier | null;
  onSaved: (supplier: Supplier) => void;
}

export default function SupplierForm({ open, onOpenChange, supplier, onSaved }: SupplierFormProps) {
  const [form, setForm] = useState<FormState>(() => initial(supplier));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: Field, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    // The contract trims, strips spaces and dashes from the phone and applies the limits.
    const parsed = SupplierCreateBody.safeParse(toInput(form));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setFormError(t('suppliers.errors.validation'));
      return;
    }
    try {
      let saved: Supplier;
      if (!supplier) {
        setSaving(true);
        saved = await suppliersApi.create(parsed.data);
      } else {
        // Only what changed, compared after the contract's normalisation (null = empty).
        const next = parsed.data;
        const changes: SupplierUpdateInput = {};
        if (next.name !== supplier.name) changes.name = next.name;
        if (next.payment_terms_days !== supplier.payment_terms_days)
          changes.payment_terms_days = next.payment_terms_days;
        for (const key of ['phone', 'tax_registration_no', 'address', 'notes'] as const) {
          const value = next[key] ?? null;
          if (value !== supplier[key]) changes[key] = value;
        }
        if (Object.keys(changes).length === 0) {
          onOpenChange(false);
          return;
        }
        setSaving(true);
        saved = await suppliersApi.update(supplier.id, SupplierUpdateBody.parse(changes));
      }
      notify.success(t('suppliers.saved'));
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'SUPPLIER_NAME_TAKEN') setErrors({ name: t('suppliers.errors.nameTaken') });
      else if (code === 'SUPPLIER_PHONE_TAKEN')
        setErrors({ phone: t('suppliers.errors.phoneTaken') });
      else setFormError(t(API_ERRORS[code] ?? 'suppliers.errors.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(supplier ? 'suppliers.edit' : 'suppliers.add')}
      className="max-w-3xl!"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={t('suppliers.fields.name')}
            placeholder={t('suppliers.fields.namePlaceholder')}
            value={form.name}
            maxLength={150}
            required
            error={errors.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <FormField
            label={t('suppliers.fields.phone')}
            type="tel"
            ltr
            value={form.phone}
            maxLength={30}
            error={errors.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          <FormField
            label={t('suppliers.fields.taxNo')}
            ltr
            value={form.tax_registration_no}
            maxLength={20}
            error={errors.tax_registration_no}
            onChange={(e) => set('tax_registration_no', e.target.value)}
          />
          <NumberInput
            label={t('suppliers.fields.terms')}
            value={form.payment_terms_days}
            decimals={0}
            suffix={t('suppliers.fields.days')}
            help={t('suppliers.fields.termsHelp')}
            error={errors.payment_terms_days}
            onValueChange={(v) => set('payment_terms_days', v)}
          />
          <FormField
            label={t('suppliers.fields.address')}
            value={form.address}
            maxLength={300}
            error={errors.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
        <Textarea
          label={t('suppliers.fields.notes')}
          value={form.notes}
          maxLength={1000}
          rows={3}
          error={errors.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('suppliers.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('suppliers.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
