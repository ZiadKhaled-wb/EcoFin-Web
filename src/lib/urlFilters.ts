import { BusinessDate, Uuid } from '@ziadkhaled-wb/contracts';

/**
 * Filters a page takes from its URL (the dashboard's links open the detail pages already
 * filtered). Anything that is not a well-formed value is dropped, so a mistyped or hostile link
 * never reaches a request.
 */
export type UrlParams = Pick<URLSearchParams, 'get'>;

/** A UUID (a branch id), else ''. */
export function uuidParam(params: UrlParams, name: string): string {
  const parsed = Uuid.safeParse(params.get(name));
  return parsed.success ? parsed.data : '';
}

/** A business date (`YYYY-MM-DD`), else ''. */
export function dateParam(params: UrlParams, name: string): string {
  const parsed = BusinessDate.safeParse(params.get(name));
  return parsed.success ? parsed.data : '';
}

/** One of `allowed`, else ''. */
export function enumParam<T extends string>(
  params: UrlParams,
  name: string,
  allowed: readonly T[],
): T | '' {
  const value = params.get(name);
  return allowed.find((a) => a === value) ?? '';
}
