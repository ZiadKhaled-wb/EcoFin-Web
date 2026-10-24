import { z } from 'zod';
import { InstallmentFrequency, Uuid, type Customer } from '@ziadkhaled-wb/contracts';

/** S06 (D66): at most this many carts wait on one device for one employee. */
export const MAX_HELD_CARTS = 10;

/** A discount as it is typed; an empty value = no discount. */
const DiscountDraft = z.object({ type: z.enum(['amount', 'percent']), value: z.string().max(20) });
const StoredLine = z.object({
  key: z.string().min(1).max(80),
  product_id: Uuid,
  name: z.string().max(300),
  sku: z.string().max(100),
  unit_id: Uuid.nullable(),
  serial: z.string().max(100).nullable(),
  quantity: z.string().max(10),
  price: z.string().max(20),
  discount: DiscountDraft,
});
const StoredCustomer = z.object({
  id: Uuid,
  name: z.string().max(200).nullable(),
  phone: z.string().max(40).nullable(),
});
const cartFields = {
  lines: z.array(StoredLine).max(100),
  customer: StoredCustomer.nullable(),
  saleDiscount: DiscountDraft,
  reason: z.string().max(200),
};
/** What the cashier chose. No prices, no quote, no approval: the server prices it again. */
const CartContent = z.object(cartFields);
/** The cart on screen, kept for a refresh with its idempotency key (one sale for a second Pay). */
const ActiveCart = z.object({ ...cartFields, key: Uuid });
/**
 * EC-151: the installment terms a cashier had typed when the cart was held, and the ticked
 * guarantors. The server's preview is not kept: it is asked again, and a value the shop's policy
 * or the customer's guarantors no longer allow is replaced on resume.
 */
const InstallmentDraft = z.object({
  down_payment: z.string().max(20),
  installments_count: z.number().int().min(1).max(1000),
  frequency: InstallmentFrequency,
  first_due_date: z.string().max(10).optional(),
  guarantor_ids: z.array(Uuid).max(3),
});
const HeldCart = z.object({
  ...cartFields,
  // Carts held before EC-151 have no terms; terms that do not parse are dropped, not the cart.
  installment: InstallmentDraft.optional().catch(undefined),
  id: Uuid,
  at: z.string().datetime(),
  note: z.string().max(80),
});

export type DiscountDraft = z.infer<typeof DiscountDraft>;
export type CartLine = z.infer<typeof StoredLine>;
export type PosCustomer = z.infer<typeof StoredCustomer>;
export type CartContent = z.infer<typeof CartContent>;
export type InstallmentDraft = z.infer<typeof InstallmentDraft>;
/** What Hold keeps: the cart and, in installment mode, the terms typed so far. */
export type HeldContent = CartContent & { installment?: InstallmentDraft | undefined };
export type ActiveCart = z.infer<typeof ActiveCart>;
export type HeldCart = z.infer<typeof HeldCart>;

/** What the POS keeps of a customer: the name and the main phone. */
export const toPosCustomer = (c: Pick<Customer, 'id' | 'full_name' | 'phones'>): PosCustomer => ({
  id: c.id,
  name: c.full_name,
  phone: c.phones[0] ?? null,
});

/** Carts belong to one employee of one shop: another user of the same browser sees none of them. */
export const posScope = (orgId: string | null, employeeId: string | null | undefined) =>
  `${orgId ?? 'none'}.${employeeId ?? 'none'}`;

const activeKey = (scope: string) => `ecofin.pos.cart.${scope}`;
const heldKey = (scope: string) => `ecofin.pos.held.${scope}`;

/** The customer as the browser keeps it: the id and the name, not the phone (D66). */
const kept = <T extends CartContent>(cart: T): T => ({
  ...cart,
  customer: cart.customer ? { ...cart.customer, phone: null } : null,
});

// Every storage call may throw (private mode, a full or blocked storage): the screen works without it.

export function readActiveCart(scope: string): ActiveCart | null {
  try {
    const raw = sessionStorage.getItem(activeKey(scope));
    if (!raw) return null;
    const parsed = ActiveCart.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `null` removes it (a completed sale, New sale, Hold). */
export function writeActiveCart(scope: string, cart: ActiveCart | null): void {
  try {
    if (cart) sessionStorage.setItem(activeKey(scope), JSON.stringify(kept(cart)));
    else sessionStorage.removeItem(activeKey(scope));
  } catch {
    // Nothing to do: the cart stays in memory.
  }
}

/** Anything that does not parse is dropped silently. */
export function readHeldCarts(scope: string): HeldCart[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(heldKey(scope)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .flatMap((item) => {
        const parsed = HeldCart.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, MAX_HELD_CARTS);
  } catch {
    return [];
  }
}

export function writeHeldCarts(scope: string, carts: readonly HeldCart[]): void {
  try {
    localStorage.setItem(heldKey(scope), JSON.stringify(carts.map(kept)));
  } catch {
    // Nothing to do: the held carts stay in memory until the page is left.
  }
}
