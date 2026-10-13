import type { WarrantyClaim, ClaimStatus } from '@ziadkhaled-wb/contracts';
export function allowedClaimActions(claim: WarrantyClaim, manager: boolean): ClaimStatus[] {
  const moves: Record<ClaimStatus, ClaimStatus[]> = {
    open: ['in_repair', 'replaced', 'rejected'],
    in_repair: ['repaired', 'replaced', 'rejected'],
    repaired: ['closed'],
    replaced: ['closed'],
    closed: [],
    rejected: [],
  };
  return claim.out_of_warranty && !manager
    ? moves[claim.status].filter((s) => s === 'rejected')
    : moves[claim.status];
}
export function receivedCondition(resolution: string | null) {
  return (resolution ?? '')
    .replace(/^Received: /, '')
    .split(/\n(?:in_repair|repaired|replaced|closed|rejected): /)[0];
}
