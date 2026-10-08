import {
  FileResponse,
  FileUrlResponse,
  Product,
  ProductList,
  ProductUnitList,
  type ProductCreateBody,
  type ProductStatus,
  type ProductUnitsQuery,
  type ProductUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the products page asks for; flags are sent as 'true' / 'false' query strings. */
export interface ProductListParams {
  search?: string;
  category_id?: string;
  include_subcategories?: boolean;
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
}

export const productKeys = {
  all: (orgId: string | null) => ['products', orgId] as const,
  list: (orgId: string | null, params: ProductListParams) =>
    ['products', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['products', orgId, 'one', id] as const,
  image: (fileId: string | null) => ['product-image', fileId] as const,
  units: (orgId: string | null, id: string) => ['products', orgId, 'units', id] as const,
};

/** C02 products: every employee reads the catalog; changes need catalog.manage. */
export const productsApi = {
  list: async ({ include_subcategories, ...rest }: ProductListParams = {}) =>
    ProductList.parse(
      (
        await api.get('/api/products', {
          params: {
            ...rest,
            ...(include_subcategories === undefined
              ? {}
              : { include_subcategories: String(include_subcategories) }),
          },
        })
      ).data,
    ),
  get: async (id: string) => Product.parse((await api.get(`/api/products/${id}`)).data),
  /** The POS: an active product by exact barcode, then SKU. */
  lookup: async (code: string) =>
    Product.parse((await api.get('/api/products/lookup', { params: { code } })).data),
  /** C03: the product's serialized units in the caller's branches (in stock by default). */
  units: async (id: string, status: ProductUnitsQuery['status'] = 'in_stock') =>
    ProductUnitList.parse(
      (await api.get(`/api/products/${id}/units`, { params: { status } })).data,
    ),
  create: async (body: ProductCreateBody) =>
    Product.parse((await api.post('/api/products', body)).data),
  update: async (id: string, body: ProductUpdateBody) =>
    Product.parse((await api.patch(`/api/products/${id}`, body)).data),
  archive: async (id: string) =>
    Product.parse((await api.post(`/api/products/${id}/archive`)).data),
  restore: async (id: string) =>
    Product.parse((await api.post(`/api/products/${id}/restore`)).data),
  /** F14 upload with purpose "product_image"; the returned id goes into image_file_id. */
  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append('purpose', 'product_image');
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
  /** Short-lived signed link to show the image. */
  imageUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
