import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  amountInWordsAr,
  CONTRACT_TEMPLATE_PLACEHOLDERS,
  CONTRACT_TERMS_MAX_LENGTH,
  DEFAULT_CONTRACT_TERMS_AR,
  checkContractTemplate,
  renderContractTemplate,
  type ContractTemplatePlaceholder,
  type PromissoryNotesMode,
  type ShopSettings,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import RadioGroup from '@/components/ui/RadioGroup';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { settingsApi } from '@/services/settingsApi';
import { settingsKeys } from '@/features/settings/useSettings';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import { DOC } from './documentText';

/** Sample values for the preview: a made-up contract, never real data. */
const SAMPLE: Record<ContractTemplatePlaceholder, string> = {
  shop_name: 'معرض النور',
  shop_legal_name: 'شركة النور للتجارة',
  commercial_register: '123456',
  branch_name: 'الفرع الرئيسي',
  city: 'القاهرة',
  contract_number: 'MAIN-CT-26-000001',
  contract_date: '٢٠‏/١٠‏/٢٠٢٦',
  customer_name: 'أحمد محمد',
  customer_national_id: '29001010100501',
  installment_price: '١٢٬٠٠٠٫٠٠ ج.م',
  installment_price_words: amountInWordsAr('12000.00'),
  down_payment: '٢٬٠٠٠٫٠٠ ج.م',
  installments_count: '١٢',
  frequency: DOC.frequencyName.monthly,
  first_due_date: '٢٠‏/١١‏/٢٠٢٦',
  last_due_date: '٢٠‏/١٠‏/٢٠٢٧',
};

const ERRORS = ['TEMPLATE_NOT_ALLOWED', 'TEMPLATE_INVALID', 'PERMISSION_DENIED'];

/**
 * N07 (D82), settings screen (installments tab): how promissory notes are issued and the terms
 * text printed on the contract. The server checks the same rules as `checkContractTemplate`
 * (no forbidden wording, only the fixed placeholders); this screen warns while typing.
 */
export default function ContractTermsSettings({ saved }: { saved: ShopSettings }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [mode, setMode] = useState<PromissoryNotesMode>(saved.promissory_notes_mode);
  const [text, setText] = useState(saved.contract_terms ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const caret = useRef<{ start: number; end: number } | null>(null);

  const check = checkContractTemplate(text);
  const tooLong = text.length > CONTRACT_TERMS_MAX_LENGTH;
  const changed = mode !== saved.promissory_notes_mode || text !== (saved.contract_terms ?? '');
  const preview = renderContractTemplate(
    text.trim() === '' ? DEFAULT_CONTRACT_TERMS_AR : text,
    SAMPLE,
  );

  function insert(name: ContractTemplatePlaceholder) {
    const token = `{{${name}}}`;
    const at = caret.current ?? { start: text.length, end: text.length };
    const next = text.slice(0, at.start) + token + text.slice(at.end);
    setText(next);
    caret.current = { start: at.start + token.length, end: at.start + token.length };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !check.ok || tooLong) return;
    setError('');
    setBusy(true);
    try {
      await settingsApi.update({
        promissory_notes_mode: mode,
        contract_terms: text.trim() === '' ? null : text,
      });
      await cache.invalidateQueries({ queryKey: settingsKeys.settings(orgId) });
      notify.success(t('contractDocuments.settings.saved'));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(
        t(
          (ERRORS.includes(code)
            ? `contractDocuments.errors.${code}`
            : 'contractDocuments.errors.failed') as TranslationKey,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('contractDocuments.settings.title')}>
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <p className="type-caption">{t('contractDocuments.settings.intro')}</p>
        <RadioGroup
          label={t('contractDocuments.settings.mode')}
          name="promissory-notes-mode"
          value={mode}
          options={[
            { value: 'per_installment', label: t('contractDocuments.settings.perInstallment') },
            { value: 'single', label: t('contractDocuments.settings.single') },
          ]}
          onChange={(v) => setMode(v === 'single' ? 'single' : 'per_installment')}
        />
        {mode === 'single' && (
          <p className="type-caption">{t('contractDocuments.settings.singleHint')}</p>
        )}
        <Textarea
          label={t('contractDocuments.settings.terms')}
          help={t('contractDocuments.settings.termsHelp')}
          rows={10}
          value={text}
          dir="rtl"
          onChange={(e) => {
            setText(e.target.value);
            caret.current = {
              start: e.target.selectionStart ?? e.target.value.length,
              end: e.target.selectionEnd ?? e.target.value.length,
            };
          }}
          onSelect={(e) => {
            caret.current = {
              start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd,
            };
          }}
          invalid={!check.ok || tooLong}
        />
        <p className="type-caption">
          {t(
            text.trim() === ''
              ? 'contractDocuments.settings.usingDefault'
              : 'contractDocuments.settings.usingOwn',
          )}
        </p>
        {check.words.length > 0 && (
          <Notice tone="error">
            {t('contractDocuments.settings.warnWords', { words: check.words.join('، ') })}
          </Notice>
        )}
        {check.unknown.length > 0 && (
          <Notice tone="error">
            {t('contractDocuments.settings.warnUnknown', { names: check.unknown.join('، ') })}
          </Notice>
        )}
        {tooLong && (
          <Notice tone="error">
            {t('contractDocuments.settings.tooLong', { max: CONTRACT_TERMS_MAX_LENGTH })}
          </Notice>
        )}
        <div>
          <p className="type-label mb-2">{t('contractDocuments.settings.placeholders')}</p>
          <div className="flex flex-wrap gap-2">
            {CONTRACT_TEMPLATE_PLACEHOLDERS.map((name) => (
              <button
                key={name}
                type="button"
                className="btn btn-secondary"
                data-testid={`insert-${name}`}
                onClick={() => insert(name)}
              >
                {t(`contractDocuments.settings.placeholder.${name}` as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="type-label mb-2">{t('contractDocuments.settings.previewTitle')}</p>
          <div
            className="cd-preview whitespace-pre-wrap"
            dir="rtl"
            lang="ar"
            data-testid="terms-preview"
          >
            {preview}
          </div>
        </div>
        {error && <FormError message={error} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} disabled={!changed || !check.ok || tooLong}>
            {t('contractDocuments.settings.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setText('')} disabled={text === ''}>
            {t('contractDocuments.settings.restore')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
