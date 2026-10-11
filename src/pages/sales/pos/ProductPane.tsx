import { memo, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product, UnitDetail } from '@ziadkhaled-wb/contracts';
import SearchInput from '@/components/ui/SearchInput';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { productKeys, productsApi } from '@/services/productsApi';
import { unitsApi } from '@/services/unitsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { saleError } from '../saleShared';
import { productName } from '../usePosCart';
import { POS_SHORTCUTS, inputIn, useEvent } from './usePosShortcuts';

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 300;
const LOOKUP_FRESH_MS = 30_000;
const NONE: readonly Product[] = [];

/** The tiles in reading order, and how many share the first row. */
function tilesOf(list: HTMLElement | null) {
  const tiles = Array.from(list?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const top = tiles[0]?.offsetTop;
  const columns = Math.max(1, tiles.filter((b) => b.offsetTop === top).length);
  return { tiles, columns };
}

/**
 * S06: the products side of the POS. The search box is also the scanner's target: Enter with a
 * text is a scan (an exact barcode or SKU, then an exact serial, then the one tile on screen).
 * Scans are queued, so a burst of ten is ten, in order.
 *
 * Memoised and fed only functions that never change, so a change of the cart does not draw the
 * tiles again (cheap tills).
 */
function ProductPane({
  shiftNumber,
  branchId,
  searchRef,
  onAddProduct,
  onChooseUnits,
  onAddUnit,
}: {
  shiftNumber: string;
  branchId: string;
  /** The element around the search box (the box itself takes no ref). */
  searchRef: RefObject<HTMLDivElement | null>;
  onAddProduct: (product: Product) => void;
  /** A serialized product: the cashier picks its serials. */
  onChooseUnits: (product: Product) => void;
  /** A scanned serial; false when that unit is already in the cart. */
  onAddUnit: (unit: UnitDetail) => boolean;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const categories = useQuery({
    queryKey: categoryKeys.list(orgId),
    queryFn: categoriesApi.list,
  });
  const chips = (categories.data ?? []).filter((c) => c.archived_at === null);
  const listParams = {
    ...(search ? { search } : {}),
    ...(categoryId ? { category_id: categoryId, include_subcategories: true } : {}),
    status: 'active' as const,
    pageSize: PAGE_SIZE,
  };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  const items = results.data?.items ?? NONE;

  const focusSearch = () => inputIn(searchRef)?.focus();

  const add = useEvent((product: Product) => {
    setMessage('');
    if (product.is_serialized) onChooseUnits(product);
    else {
      onAddProduct(product);
      focusSearch();
    }
  });

  /** Nothing was added: say why, and put the code back, selected, so the next scan replaces it. */
  function fail(text: string, code: string) {
    setMessage(text);
    setSearchInput((now) => (now === '' ? code : now));
    setTimeout(() => {
      const box = inputIn(searchRef);
      if (box && box.value === code) box.select();
    }, 0);
  }

  async function scan(code: string, onlyTile: Product | null) {
    let product: Product | null = null;
    try {
      product = await cache.fetchQuery({
        queryKey: [...productKeys.all(orgId), 'lookup', code],
        queryFn: () => productsApi.lookup(code),
        staleTime: LOOKUP_FRESH_MS,
        retry: false,
      });
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'PRODUCT_NOT_FOUND') {
        fail(saleError(err), code);
        return;
      }
    }
    if (product) {
      add(product);
      return;
    }
    // Not a barcode or SKU: an exact serial sells that unit.
    let unit: UnitDetail | null = null;
    try {
      unit = await unitsApi.find(code);
    } catch {
      // No such serial (or no right to look for one).
    }
    if (unit) {
      if (unit.status !== 'in_stock') fail(t('sales.pos.scan.unitNotInStock'), code);
      else if (unit.branch_id !== branchId)
        fail(t('sales.pos.scan.unitOtherBranch', { branch: unit.branch_name }), code);
      else if (!onAddUnit(unit)) fail(t('sales.pos.scan.unitInCart'), code);
      else setMessage('');
      return;
    }
    if (onlyTile) add(onlyTile);
    else fail(t('sales.pos.scan.notFound'), code);
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      const first = tilesOf(listRef.current).tiles[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const code = searchInput.trim();
    if (e.key !== 'Enter' || code === '') return;
    e.preventDefault();
    // The one tile the cashier is looking at, when the typed text is what the list shows.
    const onlyTile = search === code && items.length === 1 ? (items[0] ?? null) : null;
    // The box is emptied at once: the next scan must not be glued to this one.
    setSearchInput('');
    setMessage('');
    queue.current = queue.current.then(() => scan(code, onlyTile)).catch(() => undefined);
  }

  const onTilesKeyDown = useEvent((e: KeyboardEvent<HTMLUListElement>) => {
    const { tiles, columns } = tilesOf(listRef.current);
    const at = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const to =
      e.key === forward
        ? at + 1
        : e.key === back
          ? at - 1
          : e.key === 'ArrowDown'
            ? at + columns
            : e.key === 'ArrowUp'
              ? at - columns
              : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0) focusSearch();
    else tiles[Math.min(to, tiles.length - 1)]?.focus();
  });

  const chip = (active: boolean) =>
    cn('btn btn-sm shrink-0', active ? 'btn-primary' : 'btn-secondary');

  return (
    <section className="flex min-h-0 flex-col rounded-panel border border-line bg-surface">
      <div className="space-y-3 border-b border-line p-4">
        <p className="type-caption flex items-center justify-between gap-2">
          <span dir="ltr">{t('sales.pos.shift', { number: shiftNumber })}</span>
          <kbd className="type-caption" aria-hidden>
            {POS_SHORTCUTS.search}
          </kbd>
        </p>
        <div ref={searchRef}>
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            onKeyDown={onSearchKeyDown}
            label={t('sales.pos.search')}
            placeholder={t('sales.pos.search')}
            aria-keyshortcuts={POS_SHORTCUTS.search}
            autoComplete="off"
          />
        </div>
        {message && (
          <p role="alert" className="error-text">
            {message}
          </p>
        )}
        {chips.length > 0 && (
          <div
            role="group"
            aria-label={t('sales.pos.categories')}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            <button
              type="button"
              aria-pressed={categoryId === null}
              className={chip(categoryId === null)}
              onClick={() => setCategoryId(null)}
            >
              {t('sales.pos.allCategories')}
            </button>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                className={chip(categoryId === c.id)}
                onClick={() => setCategoryId(c.id)}
              >
                <span dir="auto">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="max-h-[50dvh] min-h-0 flex-1 overflow-y-auto p-4 lg:max-h-none">
        {results.isError && <p role="alert">{t('sales.errors.failed')}</p>}
        {results.data && items.length === 0 && (
          <p className="type-caption">{t('sales.pos.noResults')}</p>
        )}
        <Tiles items={items} listRef={listRef} onKeyDown={onTilesKeyDown} onAdd={add} />
      </div>
    </section>
  );
}

const Tiles = memo(function Tiles({
  items,
  listRef,
  onKeyDown,
  onAdd,
}: {
  items: readonly Product[];
  listRef: RefObject<HTMLUListElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLUListElement>) => void;
  onAdd: (product: Product) => void;
}) {
  if (items.length === 0) return null;
  return (
    // Arrow keys move between the tiles; the list itself takes no focus.
    <ul
      ref={listRef}
      onKeyDown={onKeyDown}
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
    >
      {items.map((p) => {
        const name = productName(p);
        return (
          <li key={p.id}>
            <button
              type="button"
              aria-label={t(p.is_serialized ? 'sales.pos.chooseUnitOf' : 'sales.pos.addOf', {
                name,
              })}
              onClick={() => onAdd(p)}
              className="flex h-full min-h-24 w-full flex-col justify-between gap-1 rounded-control border border-line bg-surface p-3 text-start hover:border-brand-600 focus-visible:border-brand-600"
            >
              <span className="min-w-0">
                <span className="line-clamp-2 block" dir="auto">
                  {name}
                </span>
                <span className="type-caption block truncate" dir="ltr">
                  {p.sku}
                </span>
              </span>
              <span className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="num type-label">{formatMoney(p.cash_price)}</span>
                {p.is_serialized && (
                  <span className="type-caption">{t('sales.pos.chooseUnit')}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
});

export default memo(ProductPane);
