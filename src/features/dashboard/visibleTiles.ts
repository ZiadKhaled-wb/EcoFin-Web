import type { OwnerDashboard } from '@ziadkhaled-wb/contracts';

/** The tiles that are drawn: a tile the caller cannot open (null) is not drawn. */
export function visibleTileCount(tiles: OwnerDashboard['tiles']): number {
  return Object.values(tiles).filter((tile) => tile !== null).length;
}
