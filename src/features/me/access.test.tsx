import { render, renderHook, screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { PERMISSION_KEYS, type MePermissionsResponse } from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Can from '@/features/me/Can';
import { useBranchAccess } from '@/features/me/useBranchAccess';
import { useCan } from '@/features/me/useCan';
import { usePermissions } from '@/features/me/usePermissions';

vi.mock('@/features/me/usePermissions', () => ({ usePermissions: vi.fn() }));

const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';

/** What usePermissions() returns in each state; only `data` matters to these hooks. */
function mockPermissions(data: MePermissionsResponse | undefined) {
  vi.mocked(usePermissions).mockReturnValue({ data } as UseQueryResult<MePermissionsResponse>);
}
const loaded = (over: Partial<MePermissionsResponse> = {}): MePermissionsResponse => ({
  keys: ['sale.create', 'refund.create'],
  branchIds: [BRANCH_A],
  allBranches: false,
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe('useCan', () => {
  it('true for a held key, false for any other', () => {
    mockPermissions(loaded());
    expect(renderHook(() => useCan('sale.create')).result.current).toBe(true);
    expect(renderHook(() => useCan('sale.void')).result.current).toBe(false);
  });

  it('fails closed while loading or on error (no data)', () => {
    mockPermissions(undefined);
    expect(renderHook(() => useCan('sale.create')).result.current).toBe(false);
  });

  it('works for every key in the shared contract (owner holds all 61)', () => {
    mockPermissions(loaded({ keys: [...PERMISSION_KEYS], allBranches: true }));
    for (const key of PERMISSION_KEYS) {
      expect(renderHook(() => useCan(key)).result.current).toBe(true);
    }
  });
});

describe('<Can>', () => {
  it('renders the children when the key is held', () => {
    mockPermissions(loaded({ keys: ['employee.manage'] }));
    render(
      <Can permission="employee.manage">
        <button type="button">Manage</button>
      </Can>,
    );
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
  });

  it('renders nothing without the key (a cashier never sees the button)', () => {
    mockPermissions(loaded());
    const { container } = render(
      <Can permission="employee.manage">
        <button type="button">Manage</button>
      </Can>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the fallback without the key, and while loading', () => {
    mockPermissions(loaded());
    const { rerender } = render(
      <Can permission="employee.manage" fallback={<span>read only</span>}>
        <button type="button">Manage</button>
      </Can>,
    );
    expect(screen.getByText('read only')).toBeInTheDocument();
    mockPermissions(undefined);
    rerender(
      <Can permission="employee.manage" fallback={<span>still loading</span>}>
        <button type="button">Manage</button>
      </Can>,
    );
    expect(screen.getByText('still loading')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('useBranchAccess', () => {
  it('an employee works only in assigned branches', () => {
    mockPermissions(loaded());
    expect(renderHook(() => useBranchAccess(BRANCH_A)).result.current).toBe(true);
    expect(renderHook(() => useBranchAccess(BRANCH_B)).result.current).toBe(false);
  });

  it('the owner (allBranches) works everywhere', () => {
    mockPermissions(loaded({ branchIds: [BRANCH_A, BRANCH_B], allBranches: true }));
    expect(renderHook(() => useBranchAccess(BRANCH_B)).result.current).toBe(true);
  });

  it('fails closed without data or without a branch id', () => {
    mockPermissions(undefined);
    expect(renderHook(() => useBranchAccess(BRANCH_A)).result.current).toBe(false);
    mockPermissions(loaded({ allBranches: true }));
    expect(renderHook(() => useBranchAccess(null)).result.current).toBe(false);
    expect(renderHook(() => useBranchAccess(undefined)).result.current).toBe(false);
  });
});
