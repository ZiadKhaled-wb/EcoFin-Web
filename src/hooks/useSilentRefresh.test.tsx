import { renderHook } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_LEAD_MS, REFRESH_RETRY_MS, useSilentRefresh } from '@/hooks/useSilentRefresh';
import { useAuthStore } from '@/store/authStore';
import { networkError, refreshRejected, session } from '@/test/authFixtures';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
});

const signIn = (expiresInMs: number) =>
  useAuthStore.setState({ ...session('a', expiresInMs), orgId: 'org' });

describe('useSilentRefresh', () => {
  it('refreshes about 60 s before expiresAt, not earlier', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: session('b', 3_600_000) });
    signIn(5 * 60_000);
    renderHook(() => useSilentRefresh());

    await vi.advanceTimersByTimeAsync(5 * 60_000 - REFRESH_LEAD_MS - 1_000);
    expect(post).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('access-b');
  });

  it('keeps the session and retries when the refresh gets no answer', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ data: session('b') });
    signIn(30_000); // already inside the 60 s window: fires at once
    renderHook(() => useSilentRefresh());
    await vi.advanceTimersByTimeAsync(10);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('access-a');

    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS + 10);
    expect(post).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBe('access-b');
  });

  it('clears the session when the server rejects the refresh', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(refreshRejected(401));
    signIn(30_000); // already inside the 60 s window: fires at once
    renderHook(() => useSilentRefresh());
    await vi.advanceTimersByTimeAsync(10);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('does nothing without a session', async () => {
    const post = vi.spyOn(axios, 'post');
    renderHook(() => useSilentRefresh());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(post).not.toHaveBeenCalled();
  });
});
