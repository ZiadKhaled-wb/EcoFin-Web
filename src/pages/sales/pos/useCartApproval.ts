import { useEffect, useRef, useState } from 'react';
import {
  DiscountAboveCapDetail,
  type DiscountApprovalRequestBody,
  type DiscountApprovalStatus,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import {
  useDiscountApproval,
  useRequestDiscountApproval,
} from '@/features/approvals/useDiscountApprovals';
import { approvalsApi } from '@/services/approvalsApi';

/** What the sale answered with DISCOUNT_ABOVE_CAP, as percents. */
interface Cap {
  cap_pct: string;
  effective_pct: string;
}

/**
 * S06 (D66) over S03 (D65): the cashier's side of an over-cap discount. The sale answered
 * DISCOUNT_ABOVE_CAP, the cashier asks a manager, the screen looks every 3 seconds, and an
 * approved request rides on the next sale as `discount_approval_id`.
 *
 * Everything here belongs to one cart, named by its idempotency key: any change to the lines, the
 * discounts, the reason or the customer makes a new key, which drops the approval (a request that
 * still waits is taken back first) and the cashier asks again.
 */
export function useCartApproval(cartKey: string) {
  const [cap, setCap] = useState<(Cap & { forKey: string }) | null>(null);
  const [asked, setAsked] = useState<{ id: string; forKey: string } | null>(null);
  const ask = useRequestDiscountApproval();
  const shown = cap && cap.forKey === cartKey ? cap : null;
  const id = asked && asked.forKey === cartKey ? asked.id : null;
  const approval = useDiscountApproval(id);
  const status: DiscountApprovalStatus | null = id ? (approval.data?.status ?? 'pending') : null;

  // A request that still waits is taken back when its cart changes or the screen is left.
  const waiting = useRef(false);
  useEffect(() => {
    waiting.current = status === 'pending';
  }, [status]);
  useEffect(() => {
    if (!id) return;
    return () => {
      if (waiting.current) void approvalsApi.cancelDiscountApproval(id).catch(() => undefined);
      waiting.current = false;
    };
  }, [id]);

  return {
    /** The panel is on screen for this cart. */
    open: shown !== null || id !== null,
    cap: shown,
    status,
    approval: id ? approval.data : undefined,
    asking: ask.isPending,
    /** Good for the next sale of this cart. */
    approvedId: id && status === 'approved' ? id : null,
    /** True when `err` is DISCOUNT_ABOVE_CAP: the panel opens with both percents. */
    refused(err: unknown): boolean {
      if (!(err instanceof ApiError) || err.code !== 'DISCOUNT_ABOVE_CAP') return false;
      const detail = DiscountAboveCapDetail.safeParse(err.details);
      setCap({
        cap_pct: detail.success ? detail.data.cap_pct : '',
        effective_pct: detail.success ? detail.data.effective_pct : '',
        forKey: cartKey,
      });
      setAsked(null);
      return true;
    },
    /** Asks a manager. Answers 'not_needed' when the server lets the sale through as it is. */
    async request(body: DiscountApprovalRequestBody): Promise<'asked' | 'not_needed' | unknown> {
      try {
        const res = await ask.mutateAsync(body);
        setCap({ cap_pct: res.cap_pct, effective_pct: res.max_effective_pct, forKey: cartKey });
        setAsked({ id: res.approval_id, forKey: cartKey });
        return 'asked';
      } catch (err) {
        if (err instanceof ApiError && err.code === 'APPROVAL_NOT_NEEDED') {
          setCap(null);
          return 'not_needed';
        }
        return err;
      }
    },
    /** Closes the panel; a request that still waits is taken back. */
    drop() {
      setCap(null);
      setAsked(null);
    },
  };
}

export type CartApproval = ReturnType<typeof useCartApproval>;
