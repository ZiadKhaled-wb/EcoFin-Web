import type { UnitStatus } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';

export const UNIT_TONE: Record<UnitStatus, BadgeTone> = {
  in_stock: 'success',
  reserved: 'brand',
  in_transit: 'warning',
  sold: 'neutral',
  returned: 'neutral',
  in_repair: 'warning',
  written_off: 'danger',
};
