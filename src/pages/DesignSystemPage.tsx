import { useState, type ReactNode } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Divider from '@/components/ui/Divider';
import Drawer from '@/components/ui/Drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import Wordmark from '@/components/ui/Wordmark';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import IconButton from '@/components/ui/IconButton';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import RadioGroup from '@/components/ui/RadioGroup';
import SearchInput from '@/components/ui/SearchInput';
import Textarea from '@/components/ui/Textarea';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import SubmitButton from '@/components/ui/SubmitButton';
import Switch from '@/components/ui/Switch';
import * as Icons from '@/components/ui/Icons';

/**
 * Living style guide. Dev-only route: /design-system (see App.tsx).
 * Every token and component below renders from the real source, so this
 * page cannot drift from the app. Add each new component here when you add it.
 */

const SWATCHES: { group: string; items: [token: string, note: string][] }[] = [
  {
    group: 'Text',
    items: [
      ['ink', 'Primary text'],
      ['ink-soft', 'Secondary text'],
      ['ink-mute', 'Help, captions'],
    ],
  },
  {
    group: 'Surfaces',
    items: [
      ['paper', 'Page'],
      ['surface', 'Card'],
      ['field', 'Input'],
      ['line', 'Border'],
      ['line-strong', 'Strong border'],
    ],
  },
  {
    group: 'Brand',
    items: [
      ['brand-50', 'Tint'],
      ['brand-100', 'Tint'],
      ['brand-500', 'Focus ring'],
      ['brand-600', 'Primary'],
      ['brand-700', 'Hover'],
      ['brand-800', 'Active'],
    ],
  },
  {
    group: 'Status',
    items: [
      ['danger-600', 'Error'],
      ['danger-50', 'Error bg'],
      ['success-600', 'Success'],
      ['success-50', 'Success bg'],
      ['ochre-500', 'Attention'],
      ['ochre-50', 'Attention bg'],
    ],
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="type-section-title border-b border-line pb-2">{title}</h2>
      {children}
    </section>
  );
}

function OverlayDemo() {
  const [start, setStart] = useState(false);
  const [end, setEnd] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-6">
      <Button variant="secondary" onClick={() => setStart(true)}>
        Drawer (start)
      </Button>
      <Button variant="secondary" onClick={() => setEnd(true)}>
        Drawer (end)
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" icon={<Icons.FilterIcon />}>
            Dropdown menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="type-caption">إجراءات</span>
          </DropdownMenuLabel>
          <DropdownMenuItem icon={<Icons.EditIcon />}>تعديل</DropdownMenuItem>
          <DropdownMenuItem icon={<Icons.PrintIcon />}>طباعة</DropdownMenuItem>
          <DropdownMenuItem icon={<Icons.DownloadIcon />} disabled>
            تصدير (معطّل)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" icon={<Icons.TrashIcon />}>
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Drawer open={start} onOpenChange={setStart} title="Drawer على جهة البداية">
        <p className="type-body p-4">
          يُغلق بزر الإغلاق أو Esc أو النقر خارجه. التركيز محبوس داخله ويعود للزر عند الإغلاق.
        </p>
      </Drawer>
      <Drawer open={end} onOpenChange={setEnd} side="end" title="Drawer على جهة النهاية">
        <p className="type-body p-4">للمعاينة أو التعديل بجانب قائمة.</p>
      </Drawer>
    </div>
  );
}

function NumberDemo() {
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('3');
  const [bad, setBad] = useState('-5');
  return (
    <div className="grid gap-5 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
      <MoneyInput
        label="السعر"
        value={price}
        onValueChange={setPrice}
        placeholder="0.00"
        help="اكتب ١٢٥٠٫٥ أو 1250.5: يُحوَّل تلقائيًا إلى 1250.50"
      />
      <NumberInput label="الكمية" value={qty} onValueChange={setQty} suffix="قطعة" />
      <MoneyInput
        label="Error"
        value={bad}
        onValueChange={setBad}
        error="القيمة يجب أن تكون أكبر من صفر."
      />
      <MoneyInput label="Disabled" value="99.00" onValueChange={() => {}} disabled />
    </div>
  );
}

function SearchDemo() {
  const [q, setQ] = useState('');
  return (
    <div className="grid gap-5 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
      <SearchInput value={q} onValueChange={setQ} placeholder="ابحث بالاسم أو الباركود..." />
      <p className="type-caption">
        Esc أو زر × لمسح البحث. القيمة الحالية:{' '}
        <span dir="ltr" className="font-mono">
          {q || '(empty)'}
        </span>
      </p>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-5 py-10">
      <header>
        <p dir="ltr" className="text-start font-mono text-sm text-brand-600">
          EcoFin Pro · Design System
        </p>
        <h1 className="type-page-title mt-1">دليل التصميم</h1>
        <p className="type-caption mt-1">
          Direction B, Deep Teal. Tokens live in src/index.css. Rules live in design.md.
        </p>
      </header>

      <Section title="Colors">
        <div className="space-y-5">
          {SWATCHES.map((g) => (
            <div key={g.group}>
              <p className="type-label mb-2">{g.group}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {g.items.map(([token, note]) => (
                  <div
                    key={token}
                    className="overflow-hidden rounded-control border border-line bg-surface"
                  >
                    <div className="h-14" style={{ background: `var(--color-${token})` }} />
                    <div className="p-2">
                      <p dir="ltr" className="text-start font-mono text-xs">
                        {token}
                      </p>
                      <p className="text-xs text-ink-mute">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-3 rounded-panel border border-line bg-surface p-6">
          <p className="type-display">type-display · مساحة العمل</p>
          <p className="type-page-title">type-page-title · تسجيل الدخول</p>
          <p className="type-section-title">type-section-title · بيانات المنشأة</p>
          <p className="type-body">type-body · النص الأساسي للنماذج والجداول والرسائل.</p>
          <p className="type-label">type-label · اسم المستخدم</p>
          <p className="type-caption">type-caption · نص مساعد أو وصف قصير</p>
          <p className="type-body">
            Numbers: <span className="num font-semibold">1,250.00</span> ج.م ·{' '}
            <span className="num font-mono">ECO-4F2A-91BC</span>
          </p>
        </div>
      </Section>

      <Section title="Button">
        <div className="space-y-5 rounded-panel border border-line bg-surface p-6">
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span dir="ltr" className="w-24 text-start font-mono text-xs text-ink-mute">
                {v}
              </span>
              <Button variant={v} size="sm">
                صغير
              </Button>
              <Button variant={v}>افتراضي</Button>
              <Button variant={v} size="lg">
                كبير
              </Button>
              <Button variant={v} icon={<Icons.CheckIcon />}>
                مع أيقونة
              </Button>
              <Button variant={v} loading loadingLabel="جارٍ الحفظ...">
                Loading
              </Button>
              <Button variant={v} disabled>
                معطّل
              </Button>
            </div>
          ))}
          <p className="type-caption">
            sm 36px (dense desktop tables only) · md 48px (default) · lg 56px (POS). SubmitButton =
            full-width Button, type="submit".
          </p>
          <div className="max-w-sm">
            <SubmitButton label="SubmitButton · حفظ" type="button" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span dir="ltr" className="w-24 text-start font-mono text-xs text-ink-mute">
              IconButton
            </span>
            <IconButton size="sm" label="بحث" icon={<Icons.SearchIcon />} />
            <IconButton label="مسح" icon={<Icons.XIcon />} />
            <IconButton size="lg" variant="secondary" label="تأكيد" icon={<Icons.CheckIcon />} />
            <IconButton variant="primary" label="حفظ" icon={<Icons.CheckIcon />} />
            <IconButton variant="danger" label="حذف" icon={<Icons.XIcon />} />
            <IconButton label="جارٍ التحميل" icon={<Icons.CheckIcon />} loading />
            <IconButton label="معطّل" icon={<Icons.XIcon />} disabled />
          </div>
        </div>
      </Section>

      <Section title="Input / FormField">
        <div className="grid gap-5 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
          <FormField
            label="Default"
            placeholder="username or email"
            ltr
            icon={<Icons.UserIcon />}
          />
          <FormField
            label="With help text"
            ltr
            help="نص مساعد يظهر تحت الحقل."
            icon={<Icons.MailIcon />}
          />
          <FormField
            label="Error"
            ltr
            defaultValue="ahmed@ecofin"
            error="البريد الإلكتروني غير صالح."
            icon={<Icons.MailIcon />}
          />
          <FormField
            label="Read-only"
            ltr
            readOnly
            defaultValue="ECO-4F2A-91BC"
            icon={<Icons.KeyIcon />}
          />
          <FormField label="Disabled" ltr disabled defaultValue="locked" />
          <FormField
            label="Password"
            type="password"
            defaultValue="secret123"
            icon={<Icons.LockIcon />}
          />
        </div>
      </Section>

      <Section title="Select">
        <div className="grid gap-5 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
          <Select
            label="الفرع"
            placeholder="اختر الفرع..."
            options={[
              { value: 'cairo', label: 'القاهرة' },
              { value: 'suez', label: 'السويس' },
              { value: 'alex', label: 'الإسكندرية', disabled: true },
            ]}
          />
          <Select
            label="Filled"
            defaultValue="suez"
            help="نص مساعد."
            options={[
              { value: 'cairo', label: 'القاهرة' },
              { value: 'suez', label: 'السويس' },
            ]}
          />
          <Select
            label="Error"
            error="اختر فرعًا للمتابعة."
            placeholder="اختر الفرع..."
            options={[{ value: 'cairo', label: 'القاهرة' }]}
          />
          <Select
            label="Disabled"
            disabled
            defaultValue="cairo"
            options={[{ value: 'cairo', label: 'القاهرة' }]}
          />
        </div>
      </Section>

      <Section title="Checkbox and Switch">
        <div className="grid gap-x-8 gap-y-2 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
          <div>
            <Checkbox label="تذكّرني على هذا الجهاز" />
            <Checkbox label="Checked" defaultChecked description="وصف قصير تحت التسمية." />
            <Checkbox label="Error" error="يجب الموافقة للمتابعة." />
            <Checkbox label="Disabled" disabled />
            <Checkbox label="Disabled + checked" disabled defaultChecked />
          </div>
          <div>
            <Switch label="تفعيل الإشعارات" description="تُطبّق فورًا." />
            <Switch label="On" defaultChecked />
            <Switch label="Disabled" disabled />
            <Switch label="Disabled + on" disabled defaultChecked />
          </div>
        </div>
      </Section>

      <Section title="Textarea and RadioGroup">
        <div className="grid gap-5 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
          <Textarea label="ملاحظات" placeholder="أضف ملاحظة..." help="اختياري." />
          <Textarea label="Error" defaultValue="..." error="الملاحظة قصيرة جدًا." />
          <RadioGroup
            label="طريقة الدفع"
            name="pay"
            defaultValue="cash"
            options={[
              { value: 'cash', label: 'نقدًا' },
              { value: 'card', label: 'بطاقة', description: 'فيزا أو ماستركارد' },
              { value: 'credit', label: 'آجل', disabled: true },
            ]}
          />
          <RadioGroup
            label="Horizontal + error"
            name="size"
            orientation="horizontal"
            error="اختر خيارًا."
            options={[
              { value: 's', label: 'صغير' },
              { value: 'm', label: 'متوسط' },
              { value: 'l', label: 'كبير' },
            ]}
          />
        </div>
      </Section>

      <Section title="NumberInput and MoneyInput">
        <NumberDemo />
      </Section>

      <Section title="SearchInput">
        <SearchDemo />
      </Section>

      <Section title="Layout: PageHeader, Card, Divider, Wordmark">
        <div className="space-y-6 rounded-panel border border-line bg-paper p-6">
          <PageHeader
            title="المنتجات"
            description="إدارة المنتجات والأسعار."
            breadcrumbs={[
              { label: 'الرئيسية', to: '/dashboard' },
              { label: 'المخزون' },
              { label: 'المنتجات' },
            ]}
            actions={<Button icon={<Icons.PlusIcon />}>منتج جديد</Button>}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Card
              title="عنوان البطاقة"
              description="وصف قصير."
              actions={
                <Badge tone="success" dot>
                  نشط
                </Badge>
              }
            >
              <p className="type-body">
                محتوى البطاقة. الحدود تحمل البنية، والظل اختياري (elevated).
              </p>
              <Divider className="my-4" />
              <p className="type-caption">Divider أفقي.</p>
            </Card>
            <Card padded={false}>
              <EmptyState
                title="بطاقة بلا حشو"
                description="padded={false} للجداول والمحتوى الممتد."
              />
            </Card>
          </div>
          <div className="flex items-center gap-6">
            <Wordmark />
            <Wordmark size="md" />
          </div>
        </div>
      </Section>

      <Section title="Overlays: Drawer and DropdownMenu">
        <OverlayDemo />
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-6">
          <Badge>محايد</Badge>
          <Badge tone="brand">نشط</Badge>
          <Badge tone="success" dot>
            مدفوع
          </Badge>
          <Badge tone="warning" dot>
            مخزون منخفض
          </Badge>
          <Badge tone="danger" dot>
            نفد المخزون
          </Badge>
        </div>
      </Section>

      <Section title="Spinner and Skeleton">
        <div className="grid gap-6 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
          <div className="flex items-center gap-5">
            <Spinner size="sm" /> <Spinner /> <Spinner size="lg" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </Section>

      <Section title="EmptyState and ErrorState">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-panel border border-line bg-surface">
            <EmptyState
              title="لا توجد منتجات بعد"
              description="أضف أول منتج لبدء البيع وتتبّع المخزون."
              action={<Button>إضافة منتج</Button>}
            />
          </div>
          <div className="rounded-panel border border-line bg-surface">
            <ErrorState onRetry={() => {}} />
          </div>
        </div>
      </Section>

      <Section title="Feedback">
        <div className="grid max-w-xl gap-3">
          <Notice tone="success">Success · تم الحفظ بنجاح.</Notice>
          <Notice tone="info">Info · تم إرسال الدعوة.</Notice>
          <Notice tone="error">Error notice · تعذر إكمال العملية.</Notice>
          <FormError message="FormError · بيانات الدخول غير صحيحة." />
          <div role="status" className="flex items-center gap-3 text-ink-soft">
            <span className="spinner" aria-hidden /> Loading · جارٍ التحميل...
          </div>
        </div>
      </Section>

      <Section title="Icons">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {Object.entries(Icons).map(([name, Icon]) => (
            <div
              key={name}
              className="flex flex-col items-center gap-2 rounded-control border border-line bg-surface p-3"
            >
              <Icon />
              <span dir="ltr" className="font-mono text-[0.65rem] text-ink-mute">
                {name.replace('Icon', '')}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
