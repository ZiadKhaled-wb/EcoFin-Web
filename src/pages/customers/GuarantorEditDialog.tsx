import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  GuarantorNationalIdTakenDetail,
  GuarantorUpdateBody,
  compareMoney,
  type Guarantor,
  type GuarantorUpdateInput,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { guarantorsApi } from '@/services/guarantorsApi';
import { t } from '@/i18n';
import GuarantorFields from './GuarantorFields';
import {
  guarantorFieldErrors,
  guarantorToForm,
  type GuarantorField,
  type GuarantorFieldErrors,
  type GuarantorFormState,
  guarantorErrorText,
} from './guarantorShared';

const sameMoney = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : compareMoney(a, b) === 0;

/** What was typed, as an update body: the national ID only when this user may see (and change) it. */
function toInput(f: GuarantorFormState, idLocked: boolean): GuarantorUpdateInput {
  const body: GuarantorUpdateInput = {
    full_name: f.full_name,
    phone: f.phone,
    address: f.address,
    job: f.job,
    monthly_income: f.monthly_income.trim() === '' ? null : f.monthly_income.trim(),
  };
  if (!idLocked) body.national_id = f.national_id;
  return body;
}

/** The keys that differ from the saved guarantor, compared after the contract's normalisation. */
function changesOf(next: GuarantorUpdateBody, saved: Guarantor): GuarantorUpdateInput {
  const changes: GuarantorUpdateInput = {};
  if (next.full_name !== undefined && next.full_name !== saved.full_name)
    changes.full_name = next.full_name;
  if (next.phone !== undefined && next.phone !== saved.phone) changes.phone = next.phone;
  if (next.national_id !== undefined && next.national_id !== saved.national_id)
    changes.national_id = next.national_id;
  if (next.address !== undefined && next.address !== saved.address) changes.address = next.address;
  if (next.job !== undefined && next.job !== saved.job) changes.job = next.job;
  if (next.monthly_income !== undefined && !sameMoney(next.monthly_income, saved.monthly_income))
    changes.monthly_income = next.monthly_income;
  return changes;
}

/**
 * R04 (D71) edit a guarantor. The national ID can only be changed by a user who may see it
 * (customer.view_pii); everyone else sees its last four digits, read-only. Mount it per opening
 * (a new key): the form starts from the saved guarantor each time.
 */
export default function GuarantorEditDialog({
  open,
  onOpenChange,
  guarantor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guarantor: Guarantor;
  onSaved: (guarantor: Guarantor) => void;
}) {
  const canSeePii = useCan('customer.view_pii');
  const idLocked = !canSeePii;
  const [form, setForm] = useState<GuarantorFormState>(() => guarantorToForm(guarantor));
  const [errors, setErrors] = useState<GuarantorFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [takenBy, setTakenBy] = useState<GuarantorNationalIdTakenDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends GuarantorField>(key: K, value: GuarantorFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setTakenBy(null);
    const parsed = GuarantorUpdateBody.safeParse(toInput(form, idLocked));
    if (!parsed.success) {
      setErrors(guarantorFieldErrors(parsed.error.issues));
      setFormError(t('guarantors.errors.validation'));
      return;
    }
    const changes = changesOf(parsed.data, guarantor);
    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const saved = await guarantorsApi.update(guarantor.id, GuarantorUpdateBody.parse(changes));
      notify.success(t('guarantors.page.saved'));
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'GUARANTOR_NATIONAL_ID_TAKEN') {
        const detail = GuarantorNationalIdTakenDetail.safeParse(
          err instanceof ApiError ? err.details : undefined,
        );
        setErrors({ national_id: guarantorErrorText(code) });
        setTakenBy(detail.success ? detail.data : null);
      } else if (code === 'PERMISSION_DENIED' && changes.national_id !== undefined) {
        setErrors({ national_id: t('guarantors.errors.nationalIdPermission') });
      } else setFormError(guarantorErrorText(code));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('guarantors.form.editTitle')}
      className="max-w-3xl!"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <GuarantorFields
          form={form}
          errors={errors}
          set={set}
          idLocked={idLocked}
          maskedId={guarantor.national_id_masked}
          idSaved
        />
        {takenBy && (
          <p className="type-caption" role="status">
            {t('guarantors.add.takenTitle', { name: takenBy.full_name })}{' '}
            <Link
              to={`/customers/guarantors/${takenBy.guarantor_id}`}
              className="text-brand-700 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {t('guarantors.section.open')}
            </Link>
          </p>
        )}
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('guarantors.form.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('guarantors.form.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
