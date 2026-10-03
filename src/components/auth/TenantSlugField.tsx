import FormField from '@/components/ui/FormField';
import { t } from '@/i18n';

interface Props {
  slug: string;
  error?: string;
  onChange: (v: string) => void;
  locked: boolean;
  onUnlock: () => void;
}

/** Known slug -> read-only context line. Unknown -> editable field with help. */
export default function TenantSlugField({ slug, error, onChange, locked, onUnlock }: Props) {
  if (locked) {
    return (
      <div className="notice notice-info flex items-center justify-between gap-3">
        <span>
          {t('auth.shop.loginTo')}{' '}
          <strong className="font-mono" dir="ltr">
            {slug}
          </strong>
        </span>
        <button type="button" className="btn-link" onClick={onUnlock}>
          {t('auth.shop.change')}
        </button>
      </div>
    );
  }
  return (
    <FormField
      label={t('auth.shop.label')}
      ltr
      required
      autoComplete="organization"
      placeholder="testshop"
      value={slug}
      error={error}
      onChange={(e) => onChange(e.target.value)}
      help={t('auth.shop.help')}
    />
  );
}
