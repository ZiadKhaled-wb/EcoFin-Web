import { QueryClient } from '@tanstack/react-query';

/** Shared so the auth store can clear the cache on logout or session loss. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
