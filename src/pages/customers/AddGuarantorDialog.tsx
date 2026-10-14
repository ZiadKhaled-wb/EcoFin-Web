import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CustomerGuarantorLinkBody,
  GuarantorCreateBody,
  GuarantorNationalIdTakenDetail,
  type Customer,
  type GuarantorCreateInput,
  type GuarantorRelation,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { guarantorKeys, guarantorsApi } from '@/services/guarantorsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import GuarantorFields from './GuarantorFields';
import {
  emptyGuarantorForm,
  guarantorFieldErrors,
  type GuarantorField,
  type GuarantorFieldErrors,
  type GuarantorFormState,
  guarantorErrorText,
  relationOptions,
} from './guarantorShared';

type Tab = 'new' | 'existing';

export interface AddGuarantorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Pick<Customer, 'id' | 'full_name'>;
  /** The guarantors this customer already has (they can't be picked again). */
  linkedIds: string[];
  onDone: () => void;
}

/** The form as a create body; empty optional fields are left out (the server keeps null). */
function toInput(
  f: GuarantorFormState,
  customerId: string,
  relation: string,
): GuarantorCreateInput {
  const body: GuarantorCreateInput = {
    full_name: f.full_name,
    phone: f.phone,
    national_id: f.national_id,
    link: { customer_id: customerId, relation: relation as GuarantorRelation },
  };
  if (f.address.trim()) body.address = f.address;
  if (f.job.trim()) body.job = f.job;
  if (f.monthly_income.trim()) body.monthly_income = f.monthly_income.trim();
  return body;
}

/**
 * R04 (D71) add a guarantor to a customer: a new person (created and linked in one request) or
 * one that is already registered in the shop. A national ID another guarantor has switches to
 * the "already registered" tab with that guarantor selected. Mount it per opening (a new key).
 */
export default function AddGuarantorDialog({
  open,
  onOpenChange,
  customer,
  linkedIds,
  onDone,
}: AddGuarantorDialogProps) {
  const orgId = useAuthStore((s) => s.orgId);
  const [tab, setTab] = useState<Tab>('new');
  const [form, setForm] = useState<GuarantorFormState>(emptyGuarantorForm);
  const [relation, setRelation] = useState('');
  const [errors, setErrors] = useState<GuarantorFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [takenBy, setTakenBy] = useState<GuarantorNationalIdTakenDetail | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ id: string; full_name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends GuarantorField>(key: K, value: GuarantorFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const query = search.trim();
  const found = useQuery({
    queryKey: guarantorKeys.list(orgId, { search: query, status: 'active', pageSize: 10 }),
    queryFn: () =>
      guarantorsApi.list({ ...(query ? { search: query } : {}), status: 'active', pageSize: 10 }),
    enabled: open && tab === 'existing',
  });

  function reset() {
    setErrors({});
    setFormError('');
    setTakenBy(null);
  }

  function fail(err: unknown) {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'GUARANTOR_NATIONAL_ID_TAKEN') {
      const detail = GuarantorNationalIdTakenDetail.safeParse(
        err instanceof ApiError ? err.details : undefined,
      );
      setErrors({ national_id: guarantorErrorText(code) });
      setTakenBy(detail.success ? detail.data : null);
    } else setFormError(guarantorErrorText(code));
  }

  async function createNew(e: FormEvent) {
    e.preventDefault();
    reset();
    // The contract trims, normalises the phone and the ID, and applies the limits.
    const parsed = GuarantorCreateBody.safeParse(toInput(form, customer.id, relation));
    if (!parsed.success) {
      setErrors(guarantorFieldErrors(parsed.error.issues));
      setFormError(t('guarantors.errors.validation'));
      return;
    }
    setSaving(true);
    try {
      await guarantorsApi.create(parsed.data);
      notify.success(t('guarantors.add.added'));
      onDone();
      onOpenChange(false);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function linkExisting(e: FormEvent) {
    e.preventDefault();
    reset();
    if (!picked) {
      setFormError(t('guarantors.errors.pick'));
      return;
    }
    const parsed = CustomerGuarantorLinkBody.safeParse({ guarantor_id: picked.id, relation });
    if (!parsed.success) {
      setErrors({ relation: t('guarantors.errors.relation') });
      return;
    }
    setSaving(true);
    try {
      await guarantorsApi.link(customer.id, parsed.data);
      notify.success(t('guarantors.add.linked'));
      onDone();
      onOpenChange(false);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  function switchToExisting(detail: GuarantorNationalIdTakenDetail) {
    reset();
    setPicked({ id: detail.guarantor_id, full_name: detail.full_name });
    setSearch('');
    setTab('existing');
  }

  const tabClass = (active: boolean) =>
    cn(
      'rounded-control px-3 py-1.5 type-label',
      active ? 'bg-brand-600 text-white' : 'text-ink-mute hover:bg-line',
    );
  const relationField = (
    <Select
      label={t('guarantors.fields.relation')}
      placeholder={t('guarantors.fields.relationPlaceholder')}
      options={relationOptions()}
      value={relation}
      required
      error={errors.relation}
      onChange={(e) => setRelation(e.target.value)}
    />
  );
  const actions = (label: string) => (
    <div className="flex gap-2">
      <Button type="submit" disabled={saving}>
        {label}
      </Button>
      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
        {t('guarantors.add.cancel')}
      </Button>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('guarantors.add.title')}
      description={t('guarantors.add.description', { name: customer.full_name })}
      className="max-w-3xl!"
    >
      <div className="space-y-4">
        <div role="tablist" aria-label={t('guarantors.add.tabs')} className="flex gap-2">
          {(['new', 'existing'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`add-guarantor-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`add-guarantor-panel-${id}`}
              className={tabClass(tab === id)}
              onClick={() => {
                reset();
                setTab(id);
              }}
            >
              {t(id === 'new' ? 'guarantors.add.new' : 'guarantors.add.existing')}
            </button>
          ))}
        </div>

        {tab === 'new' ? (
          <form
            role="tabpanel"
            id="add-guarantor-panel-new"
            aria-labelledby="add-guarantor-tab-new"
            onSubmit={(e) => void createNew(e)}
            className="space-y-4"
            noValidate
          >
            <GuarantorFields form={form} errors={errors} set={set} />
            <div className="sm:max-w-xs">{relationField}</div>
            {takenBy && (
              <div role="status" className="rounded-panel border border-line p-3">
                <p>{t('guarantors.add.takenTitle', { name: takenBy.full_name })}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => switchToExisting(takenBy)}
                >
                  {t('guarantors.add.takenAction')}
                </Button>
              </div>
            )}
            <FormError message={formError} />
            {actions(t('guarantors.add.save'))}
          </form>
        ) : (
          <form
            role="tabpanel"
            id="add-guarantor-panel-existing"
            aria-labelledby="add-guarantor-tab-existing"
            onSubmit={(e) => void linkExisting(e)}
            className="space-y-4"
            noValidate
          >
            <SearchInput
              value={search}
              onValueChange={setSearch}
              label={t('guarantors.add.search')}
              placeholder={t('guarantors.add.search')}
            />
            {found.isPending ? (
              <LoadingState />
            ) : (found.data?.items ?? []).length === 0 ? (
              <p className="type-caption">{t('guarantors.add.searchEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-panel border border-line">
                {(found.data?.items ?? []).map((g) => {
                  const linked = linkedIds.includes(g.id);
                  const chosen = picked?.id === g.id;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        aria-pressed={chosen}
                        disabled={linked}
                        onClick={() => setPicked({ id: g.id, full_name: g.full_name })}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-start',
                          chosen && 'bg-brand-50',
                          linked && 'opacity-60',
                        )}
                      >
                        <span>
                          {g.full_name}
                          <span dir="ltr" className="type-caption ms-2">
                            {g.phone}
                          </span>
                        </span>
                        <span className="type-caption">
                          {linked
                            ? t('guarantors.add.alreadyLinked')
                            : (g.national_id ?? g.national_id_masked)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {picked && (
              <p role="status" className="type-caption">
                {t('guarantors.add.picked', { name: picked.full_name })}
              </p>
            )}
            <div className="sm:max-w-xs">{relationField}</div>
            <FormError message={formError} />
            {actions(t('guarantors.add.link'))}
          </form>
        )}
      </div>
    </Dialog>
  );
}
