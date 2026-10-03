import FormField from '@/components/ui/FormField';

interface Props {
  slug: string;
  onChange: (v: string) => void;
  locked: boolean;
  onUnlock: () => void;
}

/** Known slug -> read-only context line. Unknown -> editable field with help. */
export default function TenantSlugField({ slug, onChange, locked, onUnlock }: Props) {
  if (locked) {
    return (
      <div className="notice notice-info flex items-center justify-between gap-3">
        <span>
          تسجيل الدخول إلى:{' '}
          <strong className="font-mono" dir="ltr">
            {slug}
          </strong>
        </span>
        <button type="button" className="btn-link" onClick={onUnlock}>
          تغيير
        </button>
      </div>
    );
  }
  return (
    <FormField
      label="معرّف المنشأة"
      ltr
      required
      autoComplete="organization"
      placeholder="testshop"
      value={slug}
      onChange={(e) => onChange(e.target.value)}
      help="يحدد هذا المعرّف منشأتك عند الدخول. تجده في رسالة التفعيل أو لدى مدير النظام."
    />
  );
}
