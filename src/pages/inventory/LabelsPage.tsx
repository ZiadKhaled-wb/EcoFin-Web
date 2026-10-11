import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Product, ProductUnit } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { getLanguage, t } from '@/i18n';
import { productKeys, productsApi } from '@/services/productsApi';
import { useAuthStore } from '@/store/authStore';
import { LABEL_TEMPLATES, pageCss, type LabelData, type LabelTemplateId } from '@/lib/labels';
import LabelSheet from './LabelSheet';

const TEMPLATE_KEY = 'ecofin-label-template';
const MAX_PER_ITEM = 500;

/** A line of the print list: a product (with a label count) or one unit (one label). */
interface Item {
  key: string;
  product: Product;
  unit: ProductUnit | null;
  quantity: string;
}

function readTemplate(): LabelTemplateId {
  try {
    const saved = window.localStorage.getItem(TEMPLATE_KEY);
    const found = LABEL_TEMPLATES.find((tpl) => tpl.id === saved);
    return found ? found.id : LABEL_TEMPLATES[0].id;
  } catch {
    return LABEL_TEMPLATES[0].id;
  }
}

function productName(p: Product) {
  return getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;
}

/** Labels for the list: quantity copies of a product label, one label per unit. */
function toLabels(items: Item[], showPrice: boolean): LabelData[] {
  return items.flatMap((item): LabelData[] => {
    const base = {
      name: productName(item.product),
      price: showPrice ? item.product.cash_price : null,
    };
    if (item.unit) {
      return [{ ...base, key: item.key, code: item.unit.serial, serial: item.unit.serial }];
    }
    const count = Math.min(Number(item.quantity || '0'), MAX_PER_ITEM);
    return Array.from({ length: count }, (_, i) => ({
      ...base,
      key: `${item.key}-${i}`,
      code: item.product.barcode ?? item.product.sku,
      serial: null,
    }));
  });
}

export default function LabelsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const [params] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [templateId, setTemplateId] = useState<LabelTemplateId>(readTemplate);
  const [showPrice, setShowPrice] = useState(true);
  const [unitsFor, setUnitsFor] = useState<Product | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const template = LABEL_TEMPLATES.find((tpl) => tpl.id === templateId) ?? LABEL_TEMPLATES[0];

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
  });

  // Opened from the products page with ?product=<id>: start with one label of it.
  const preset = params.get('product');
  const presetProduct = useQuery({
    queryKey: ['products', orgId, 'one', preset],
    queryFn: () => productsApi.get(preset!),
    enabled: !!preset,
  });
  const [presetDone, setPresetDone] = useState(false);
  if (presetProduct.data && !presetDone) {
    setPresetDone(true);
    if (!presetProduct.data.archived_at) addProduct(presetProduct.data);
  }

  const units = useQuery({
    queryKey: productKeys.units(orgId, unitsFor?.id ?? ''),
    queryFn: () => productsApi.units(unitsFor!.id),
    enabled: !!unitsFor,
  });

  function addProduct(product: Product) {
    setItems((list) => {
      const existing = list.find((i) => !i.unit && i.product.id === product.id);
      if (existing) {
        return list.map((i) =>
          i === existing ? { ...i, quantity: String(Number(i.quantity || '0') + 1) } : i,
        );
      }
      return [...list, { key: product.id, product, unit: null, quantity: '1' }];
    });
  }

  function addUnits() {
    if (!unitsFor) return;
    const chosen = (units.data ?? []).filter((u) => picked.has(u.id));
    setItems((list) => [
      ...list,
      ...chosen
        .filter((u) => !list.some((i) => i.unit?.id === u.id))
        .map((u) => ({ key: u.id, product: unitsFor, unit: u, quantity: '1' })),
    ]);
    setUnitsFor(null);
  }

  function chooseTemplate(id: LabelTemplateId) {
    setTemplateId(id);
    try {
      window.localStorage.setItem(TEMPLATE_KEY, id);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  const labels = toLabels(items, showPrice);

  return (
    <PageContainer>
      <PageHeader title={t('labels.title')} />
      <p className="type-caption mb-4">{t('labels.subtitle')}</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-3 p-4">
          <h2 className="type-label">{t('labels.results')}</h2>
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            label={t('labels.search')}
            placeholder={t('labels.search')}
          />
          {results.isError && <p role="alert">{t('labels.loadFailed')}</p>}
          {results.data && results.data.items.length === 0 && (
            <p className="type-caption">{t('labels.noResults')}</p>
          )}
          <ul className="divide-y divide-line">
            {(results.data?.items ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{productName(p)}</span>
                  <span className="type-caption block" dir="ltr">
                    {p.sku}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => addProduct(p)}>
                    {t('labels.addProduct')}
                  </Button>
                  {p.is_serialized && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPicked(new Set());
                        setUnitsFor(p);
                      }}
                    >
                      {t('labels.chooseUnits')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="type-label">{t('labels.list')}</h2>
          {items.length === 0 ? (
            <p className="type-caption">{t('labels.empty')}</p>
          ) : (
            <table className="w-full text-start">
              <caption className="sr-only">{t('labels.list')}</caption>
              <thead>
                <tr>
                  <th className="type-label py-2 text-start">{t('labels.product')}</th>
                  <th className="type-label py-2 text-start">{t('labels.serial')}</th>
                  <th className="type-label py-2 text-start">{t('labels.quantity')}</th>
                  <th className="sr-only">{t('labels.remove')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} className="border-t border-line">
                    <td className="py-2">{productName(item.product)}</td>
                    <td className="py-2" dir="ltr">
                      {item.unit?.serial ?? ''}
                    </td>
                    <td className="w-32 py-2">
                      {item.unit ? (
                        '1'
                      ) : (
                        <NumberInput
                          label={t('labels.quantity')}
                          value={item.quantity}
                          decimals={0}
                          maxLength={4}
                          help={t('labels.maxPerItem', { max: MAX_PER_ITEM })}
                          onValueChange={(v) => {
                            // At most MAX_PER_ITEM labels per line: the field shows what prints.
                            const quantity =
                              v && Number(v) > MAX_PER_ITEM ? String(MAX_PER_ITEM) : v;
                            setItems((list) =>
                              list.map((i) => (i.key === item.key ? { ...i, quantity } : i)),
                            );
                          }}
                        />
                      )}
                    </td>
                    <td className="py-2 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                      >
                        {t('labels.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Select
              label={t('labels.template')}
              value={templateId}
              options={LABEL_TEMPLATES.map((tpl) => ({
                value: tpl.id,
                label: t(`labels.templates.${tpl.id}`),
              }))}
              onChange={(e) => chooseTemplate(e.target.value as LabelTemplateId)}
            />
            <Checkbox
              label={t('labels.showPrice')}
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={labels.length === 0} onClick={() => window.print()}>
              {t('labels.print')}
            </Button>
            <span className="type-caption">{t('labels.count', { count: labels.length })}</span>
          </div>
          <p className="type-caption">{t('labels.pdfHelp')}</p>
        </Card>
      </div>

      {labels.length > 0 && (
        <section className="mt-6 space-y-2" aria-label={t('labels.preview')}>
          <h2 className="type-label">{t('labels.preview')}</h2>
          <div className="overflow-auto rounded-control border border-line bg-paper p-4" dir="ltr">
            <LabelSheet labels={labels} template={template} />
          </div>
        </section>
      )}

      {/* Only this prints (index.css hides the rest of the page when printing). */}
      {createPortal(
        <div className="print-root" dir="ltr">
          <style>{pageCss(template)}</style>
          <LabelSheet labels={labels} template={template} />
        </div>,
        document.body,
      )}

      <Dialog
        open={!!unitsFor}
        onOpenChange={(v) => !v && setUnitsFor(null)}
        title={t('labels.unitsTitle', { name: unitsFor ? productName(unitsFor) : '' })}
        description={t('labels.unitsHelp')}
      >
        <div className="space-y-3">
          {units.isError && <p role="alert">{t('labels.unitsFailed')}</p>}
          {units.data && units.data.length === 0 && (
            <p className="type-caption">{t('labels.noUnits')}</p>
          )}
          {(units.data ?? []).map((u) => (
            <Checkbox
              key={u.id}
              label={<span dir="ltr">{u.serial}</span>}
              checked={picked.has(u.id)}
              onChange={(e) =>
                setPicked((set) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(u.id);
                  else next.delete(u.id);
                  return next;
                })
              }
            />
          ))}
          <Button disabled={picked.size === 0} onClick={addUnits}>
            {t('labels.addUnits')}
          </Button>
        </div>
      </Dialog>
    </PageContainer>
  );
}
