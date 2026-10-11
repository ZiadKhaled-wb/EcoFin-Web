import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CustomerCreateBody } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import SearchInput from '@/components/ui/SearchInput';
import Can from '@/features/me/Can';
import { ApiError } from '@/lib/api';
import { customerKeys, customersApi } from '@/services/customersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { saleError } from '../saleShared';
import { toPosCustomer, type PosCustomer } from './posStorage';
import { focusFirst } from './usePosShortcuts';

const SEARCH_DELAY_MS = 300;
const MIN_SEARCH = 2;
const MAX_RESULTS = 10;

const isModuleMissing = (err: unknown) =>
  err instanceof ApiError && err.code === 'MODULE_NOT_IN_PLAN';

/**
 * S06 over R01 (D63): finds a customer by name, phone or whole national ID, or makes one with a
 * name and a phone. Only the masked national ID is shown here, never the full number.
 */
export default function CustomerPicker({
  onPick,
  onClose,
  onModuleMissing,
}: {
  onPick: (customer: PosCustomer) => void;
  onClose: () => void;
  /** The plan has no customers: the screen hides the customer row. */
  onModuleMissing: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);
  const params = { search, pageSize: MAX_RESULTS };
  const results = useQuery({
    queryKey: customerKeys.list(orgId, params),
    queryFn: async () => {
      try {
        return await customersApi.list(params);
      } catch (err) {
        if (isModuleMissing(err)) onModuleMissing();
        throw err;
      }
    },
    enabled: search.length >= MIN_SEARCH,
    retry: false,
  });
  const items = search.length >= MIN_SEARCH ? (results.data?.items ?? []) : [];

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'Enter') return;
    const first = listRef.current?.querySelector('button');
    if (!first) return;
    e.preventDefault();
    // Enter takes the only match; the arrow walks into the list.
    if (e.key === 'Enter' && items.length === 1 && items[0]) onPick(toPosCustomer(items[0]));
    else first.focus();
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('sales.pos.customer.pickTitle')}
      description={t('sales.pos.customer.pickHelp')}
    >
      <div className="space-y-3" ref={focusFirst}>
        <SearchInput
          value={text}
          onValueChange={setText}
          onKeyDown={onSearchKeyDown}
          label={t('sales.pos.customer.search')}
          placeholder={t('sales.pos.customer.search')}
          autoComplete="off"
        />
        {results.isError && !isModuleMissing(results.error) && (
          <p role="alert" className="error-text">
            {t('sales.pos.customer.searchFailed')}
          </p>
        )}
        {search.length >= MIN_SEARCH && results.isSuccess && items.length === 0 && (
          <p className="type-caption">{t('sales.pos.customer.noResults')}</p>
        )}
        {items.length > 0 && (
          <ul ref={listRef} className="divide-y divide-line rounded-control border border-line">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-start hover:bg-paper focus-visible:bg-paper"
                  onClick={() => onPick(toPosCustomer(c))}
                >
                  <span className="min-w-0">
                    <span className="block truncate" dir="auto">
                      {c.full_name}
                    </span>
                    <span className="type-caption block" dir="ltr">
                      {[c.phones[0], c.national_id_masked].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {c.status === 'blocked' && (
                    <Badge tone="danger">{t('sales.pos.customer.blocked')}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Can permission="customer.create">
          {creating ? (
            <NewCustomer onCreated={onPick} onModuleMissing={onModuleMissing} />
          ) : (
            <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
              {t('sales.pos.customer.new')}
            </Button>
          )}
        </Can>
      </div>
    </Dialog>
  );
}

/** A name and one phone: the rest of the profile is the customers page's work. */
function NewCustomer({
  onCreated,
  onModuleMissing,
}: {
  onCreated: (customer: PosCustomer) => void;
  onModuleMissing: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError('');
    const parsed = CustomerCreateBody.safeParse({ full_name: name, phones: [phone] });
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path[0]);
      setErrors({
        ...(paths.includes('full_name') ? { name: t('sales.pos.customer.nameError') } : {}),
        ...(paths.includes('phones') ? { phone: t('sales.pos.customer.phoneError') } : {}),
      });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onCreated(toPosCustomer(await customersApi.create(parsed.data)));
    } catch (err) {
      setSaving(false);
      if (isModuleMissing(err)) {
        onModuleMissing();
        return;
      }
      const fields = err instanceof ApiError ? Object.keys(err.fields ?? {}) : [];
      const named = {
        ...(fields.some((f) => f.startsWith('full_name'))
          ? { name: t('sales.pos.customer.nameError') }
          : {}),
        ...(fields.some((f) => f.startsWith('phones'))
          ? { phone: t('sales.pos.customer.phoneError') }
          : {}),
      };
      setErrors(named);
      if (Object.keys(named).length === 0) setFormError(saleError(err));
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-3 border-t border-line pt-3"
      noValidate
    >
      <h3 className="type-label">{t('sales.pos.customer.new')}</h3>
      <FormField
        label={t('sales.pos.customer.name')}
        value={name}
        maxLength={150}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        {...(errors.name ? { error: errors.name } : {})}
      />
      <FormField
        label={t('sales.pos.customer.phone')}
        value={phone}
        maxLength={20}
        ltr
        inputMode="tel"
        autoComplete="off"
        onChange={(e) => setPhone(e.target.value)}
        {...(errors.phone ? { error: errors.phone } : {})}
      />
      <FormError message={formError} />
      <Button type="submit" loading={saving}>
        {t('sales.pos.customer.create')}
      </Button>
    </form>
  );
}
