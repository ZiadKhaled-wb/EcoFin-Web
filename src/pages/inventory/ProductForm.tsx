import { useId, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ProductCreateBody,
  ProductUpdateBody,
  type Category,
  type EtaItemType,
  type Product,
  type ProductCreateInput,
  type ProductUpdateInput,
  type TaxClass,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { productKeys, productsApi } from '@/services/productsApi';
import { t, type TranslationKey } from '@/i18n';

const UNITS = ['piece', 'set', 'pair', 'meter', 'box'] as const;

interface FormState {
  name_ar: string;
  name_en: string;
  sku: string;
  barcode: string;
  category_id: string;
  tax_class_id: string;
  unit_of_measure: string;
  cash_price: string;
  installment_price: string;
  warranty_months: string;
  min_stock: string;
  is_serialized: boolean;
  image_file_id: string | null;
  eta_item_code: string;
  eta_item_type: '' | EtaItemType;
}

type FieldErrors = Partial<Record<'name_ar' | 'sku' | 'barcode' | 'cash_price' | 'eta', string>>;

function initial(product: Product | null, defaultTaxClassId: string): FormState {
  return {
    name_ar: product?.name_ar ?? '',
    name_en: product?.name_en ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    category_id: product?.category_id ?? '',
    tax_class_id: product?.tax_class_id ?? defaultTaxClassId,
    // Free text; a new product starts with "piece" in the UI language.
    unit_of_measure: product?.unit_of_measure ?? t('products.units.piece'),
    cash_price: product?.cash_price ?? '',
    installment_price: product?.installment_price ?? '',
    warranty_months: String(product?.warranty_months ?? 0),
    min_stock: String(product?.min_stock ?? 0),
    is_serialized: product?.is_serialized ?? false,
    image_file_id: product?.image_file_id ?? null,
    eta_item_code: product?.eta_item_code ?? '',
    eta_item_type: product?.eta_item_type ?? '',
  };
}

/** Everything the form can send, before dropping unchanged (edit) or empty optional keys (create). */
function toBody(f: FormState) {
  return {
    name_ar: f.name_ar,
    name_en: f.name_en.trim() || null,
    sku: f.sku,
    category_id: f.category_id || null,
    tax_class_id: f.tax_class_id,
    unit_of_measure: f.unit_of_measure,
    cash_price: f.cash_price,
    installment_price: f.installment_price || null,
    warranty_months: Number(f.warranty_months || '0'),
    min_stock: Number(f.min_stock || '0'),
    is_serialized: f.is_serialized,
    image_file_id: f.image_file_id,
    eta_item_code: f.eta_item_code.trim() || null,
    eta_item_type: f.eta_item_type || null,
  };
}

const API_ERRORS: Partial<Record<string, TranslationKey>> = {
  PRODUCT_SERIAL_LOCKED: 'products.errors.serialLocked',
  PRODUCT_CATEGORY_ARCHIVED: 'products.errors.categoryArchived',
  TAX_CLASS_NOT_FOUND: 'products.errors.taxClassNotFound',
  CATEGORY_NOT_FOUND: 'products.errors.categoryNotFound',
  FILE_NOT_FOUND: 'products.errors.fileNotFound',
  PRODUCT_NOT_FOUND: 'products.errors.notFound',
  PERMISSION_DENIED: 'products.errors.permission',
  VALIDATION_FAILED: 'products.errors.validation',
};

/** Mount it per opening (a new key): the form state starts from product each time. */
export interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add. */
  product: Product | null;
  categories: Category[];
  taxClasses: TaxClass[];
  defaultTaxClassId: string;
  canChangePrice: boolean;
  onSaved: (product: Product) => void;
}

export default function ProductForm({
  open,
  onOpenChange,
  product,
  categories,
  taxClasses,
  defaultTaxClassId,
  canChangePrice,
  onSaved,
}: ProductFormProps) {
  const unitListId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => initial(product, defaultTaxClassId));
  const [regenerate, setRegenerate] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const image = useQuery({
    queryKey: productKeys.image(form.image_file_id),
    queryFn: () => productsApi.imageUrl(form.image_file_id!),
    enabled: open && !!form.image_file_id,
    staleTime: 30_000,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const editing = !!product;
  const pricesLocked = editing && !canChangePrice;

  // Active categories (children indented under their parent) plus the product's own.
  const categoryOptions = categories
    .filter((c) => !c.archived_at || c.id === product?.category_id)
    .map((c) => ({ value: c.id, label: `${c.parent_id ? '— ' : ''}${c.name}` }));
  const taxOptions = taxClasses
    .filter((c) => !c.archived_at || c.id === product?.tax_class_id)
    .map((c) => ({ value: c.id, label: c.name }));

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      const saved = await productsApi.uploadImage(file);
      set('image_file_id', saved.id);
      notify.info(t('products.imageUploaded'));
    } catch {
      setFormError(t('products.errors.upload'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function validationErrors(issues: { path: (string | number)[] }[]): FieldErrors {
    const out: FieldErrors = {};
    for (const issue of issues) {
      const key = String(issue.path[0] ?? '');
      if (key === 'sku') out.sku = t('products.errors.sku');
      else if (key === 'barcode') out.barcode = t('products.errors.barcode');
      else if (key === 'name_ar') out.name_ar = t('products.errors.nameAr');
      else if (key === 'cash_price') out.cash_price = t('products.errors.cashPrice');
      else if (key === 'eta_item_code' || key === 'eta_item_type')
        out.eta = t('products.errors.eta');
    }
    return out;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    // The shop default may load after the form opened.
    const all = toBody({ ...form, tax_class_id: form.tax_class_id || defaultTaxClassId });
    try {
      let saved: Product;
      if (!product) {
        // Optional keys left empty are not sent: the server applies its defaults (and a
        // missing barcode is generated).
        const body: ProductCreateInput = {
          name_ar: all.name_ar,
          sku: all.sku,
          cash_price: all.cash_price,
          ...(all.tax_class_id ? { tax_class_id: all.tax_class_id } : {}),
          unit_of_measure: all.unit_of_measure,
          warranty_months: all.warranty_months,
          min_stock: all.min_stock,
          is_serialized: all.is_serialized,
          ...(form.barcode.trim() ? { barcode: form.barcode } : {}),
          ...(all.name_en ? { name_en: all.name_en } : {}),
          ...(all.category_id ? { category_id: all.category_id } : {}),
          ...(all.installment_price ? { installment_price: all.installment_price } : {}),
          ...(all.image_file_id ? { image_file_id: all.image_file_id } : {}),
          ...(all.eta_item_code || all.eta_item_type
            ? { eta_item_code: all.eta_item_code, eta_item_type: all.eta_item_type }
            : {}),
        };
        const parsed = ProductCreateBody.safeParse(body);
        if (!parsed.success) {
          setErrors(validationErrors(parsed.error.issues));
          setFormError(t('products.errors.validation'));
          return;
        }
        setSaving(true);
        saved = await productsApi.create(parsed.data);
      } else {
        // Only what changed. Prices compare as numbers: "100" and "100.00" are the same.
        const before = toBody(initial(product, defaultTaxClassId));
        const changes: Record<string, unknown> = {};
        for (const key of Object.keys(all) as (keyof typeof all)[]) {
          const a = all[key];
          const b = before[key];
          const same =
            key === 'cash_price' || key === 'installment_price'
              ? (a === null ? null : Number(a)) === (b === null ? null : Number(b))
              : a === b;
          if (!same) changes[key] = a;
        }
        if (regenerate) changes['barcode'] = null;
        if (Object.keys(changes).length === 0) {
          onOpenChange(false);
          return;
        }
        const parsed = ProductUpdateBody.safeParse(changes as ProductUpdateInput);
        if (!parsed.success) {
          setErrors(validationErrors(parsed.error.issues));
          setFormError(t('products.errors.validation'));
          return;
        }
        setSaving(true);
        saved = await productsApi.update(product.id, parsed.data);
      }
      notify.success(t('products.saved'));
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'PRODUCT_SKU_TAKEN') setErrors({ sku: t('products.errors.skuTaken') });
      else if (code === 'PRODUCT_BARCODE_TAKEN')
        setErrors({ barcode: t('products.errors.barcodeTaken') });
      else setFormError(t(API_ERRORS[code] ?? 'products.errors.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? 'products.edit' : 'products.add')}
      className="max-w-3xl"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={t('products.fields.nameAr')}
            value={form.name_ar}
            maxLength={150}
            required
            error={errors.name_ar}
            onChange={(e) => set('name_ar', e.target.value)}
          />
          <FormField
            label={t('products.fields.nameEn')}
            value={form.name_en}
            maxLength={150}
            onChange={(e) => set('name_en', e.target.value)}
          />
          <FormField
            label={t('products.fields.sku')}
            value={form.sku}
            maxLength={40}
            ltr
            required
            error={errors.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
          />
          <div className="space-y-1">
            <FormField
              label={t('products.fields.barcode')}
              value={regenerate ? '' : form.barcode}
              maxLength={32}
              ltr
              readOnly={editing}
              error={errors.barcode}
              help={
                editing
                  ? t(
                      regenerate
                        ? 'products.fields.barcodeWillGenerate'
                        : 'products.fields.barcodeEditHelp',
                    )
                  : t('products.fields.barcodeHelp')
              }
              onChange={(e) => set('barcode', e.target.value)}
            />
            {editing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={regenerate}
                onClick={() => setRegenerate(true)}
              >
                {t('products.fields.generateBarcode')}
              </Button>
            )}
          </div>
          <Select
            label={t('products.fields.category')}
            value={form.category_id}
            options={[{ value: '', label: t('products.noCategory') }, ...categoryOptions]}
            onChange={(e) => set('category_id', e.target.value)}
          />
          <Select
            label={t('products.fields.taxClass')}
            value={form.tax_class_id || defaultTaxClassId}
            options={taxOptions}
            onChange={(e) => set('tax_class_id', e.target.value)}
          />
          <FormField
            label={t('products.fields.unit')}
            value={form.unit_of_measure}
            maxLength={20}
            list={unitListId}
            onChange={(e) => set('unit_of_measure', e.target.value)}
          />
          <datalist id={unitListId}>
            {UNITS.map((u) => (
              <option key={u} value={t(`products.units.${u}`)} />
            ))}
          </datalist>
          <MoneyInput
            label={t('products.fields.cashPrice')}
            value={form.cash_price}
            disabled={pricesLocked}
            required
            error={errors.cash_price}
            help={pricesLocked ? t('products.fields.priceLocked') : undefined}
            onValueChange={(v) => set('cash_price', v)}
          />
          <MoneyInput
            label={t('products.fields.installmentPrice')}
            value={form.installment_price}
            disabled={pricesLocked}
            help={
              pricesLocked
                ? t('products.fields.priceLocked')
                : t('products.fields.installmentPriceHelp')
            }
            onValueChange={(v) => set('installment_price', v)}
          />
          <NumberInput
            label={t('products.fields.warranty')}
            value={form.warranty_months}
            suffix={t('products.fields.months')}
            decimals={0}
            onValueChange={(v) => set('warranty_months', v)}
          />
          <NumberInput
            label={t('products.fields.minStock')}
            value={form.min_stock}
            decimals={0}
            onValueChange={(v) => set('min_stock', v)}
          />
          <FormField
            label={t('products.fields.etaCode')}
            value={form.eta_item_code}
            maxLength={40}
            ltr
            error={errors.eta}
            onChange={(e) => set('eta_item_code', e.target.value)}
          />
          <Select
            label={t('products.fields.etaType')}
            value={form.eta_item_type}
            options={[
              { value: '', label: t('products.fields.etaNone') },
              { value: 'EGS', label: 'EGS' },
              { value: 'GS1', label: 'GS1' },
            ]}
            onChange={(e) => set('eta_item_type', e.target.value as FormState['eta_item_type'])}
          />
          {editing && (
            <FormField
              label={t('products.fields.avgCost')}
              value={formatNumber(product.avg_cost)}
              ltr
              readOnly
            />
          )}
        </div>
        <Switch
          label={t('products.fields.serialized')}
          checked={form.is_serialized}
          onChange={(e) => set('is_serialized', e.target.checked)}
        />
        <div className="space-y-2">
          <p className="type-label">{t('products.fields.image')}</p>
          <div className="flex flex-wrap items-center gap-3">
            {form.image_file_id && image.data ? (
              <img
                src={image.data.url}
                alt={t('products.fields.image')}
                className="h-16 w-16 rounded-control border border-line object-contain"
              />
            ) : (
              <span className="type-caption">
                {t(form.image_file_id ? 'products.fields.imageSet' : 'products.fields.noImage')}
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t('products.fields.uploadImage')}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {t('products.fields.uploadImage')}
            </Button>
            {form.image_file_id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set('image_file_id', null)}
              >
                {t('products.fields.removeImage')}
              </Button>
            )}
          </div>
        </div>
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('products.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('products.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
