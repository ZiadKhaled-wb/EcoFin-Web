import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import { t } from '@/i18n';
import type { GuarantorField, GuarantorFieldErrors, GuarantorFormState } from './guarantorShared';

/**
 * The body fields shared by the add dialog and the edit dialog. `idLocked`: the guarantor has an
 * ID this user may not see, so the field shows the mask and is read-only (R01 rule 3).
 */
export default function GuarantorFields({
  form,
  errors,
  set,
  idLocked = false,
  maskedId = null,
  idSaved = false,
}: {
  form: GuarantorFormState;
  errors: GuarantorFieldErrors;
  set: <K extends GuarantorField>(key: K, value: GuarantorFormState[K]) => void;
  idLocked?: boolean;
  maskedId?: string | null;
  /** The ID is already on file (edit): changing it is audited. */
  idSaved?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={t('guarantors.fields.fullName')}
          value={form.full_name}
          maxLength={150}
          required
          error={errors.full_name}
          onChange={(e) => set('full_name', e.target.value)}
        />
        <FormField
          label={t('guarantors.fields.phone')}
          help={t('guarantors.fields.phoneHelp')}
          type="tel"
          ltr
          value={form.phone}
          maxLength={30}
          required
          error={errors.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
      </div>
      {idLocked ? (
        <FormField
          label={t('guarantors.fields.nationalId')}
          ltr
          value={maskedId ?? ''}
          readOnly
          help={t('guarantors.fields.nationalIdLocked')}
          error={errors.national_id}
        />
      ) : (
        <FormField
          label={t('guarantors.fields.nationalId')}
          ltr
          inputMode="numeric"
          autoComplete="off"
          value={form.national_id}
          maxLength={20}
          required
          help={t(
            idSaved ? 'guarantors.fields.nationalIdChangeHint' : 'guarantors.fields.nationalIdHelp',
          )}
          error={errors.national_id}
          onChange={(e) => set('national_id', e.target.value)}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          label={t('guarantors.fields.address')}
          value={form.address}
          maxLength={300}
          error={errors.address}
          onChange={(e) => set('address', e.target.value)}
        />
        <FormField
          label={t('guarantors.fields.job')}
          value={form.job}
          maxLength={100}
          error={errors.job}
          onChange={(e) => set('job', e.target.value)}
        />
        <MoneyInput
          label={t('guarantors.fields.monthlyIncome')}
          value={form.monthly_income}
          error={errors.monthly_income}
          onValueChange={(v) => set('monthly_income', v)}
        />
      </div>
    </div>
  );
}
