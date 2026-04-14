import { useCallback, useState } from "react";

/**
 * Decouples a RefreshControl's visual state from TanStack Query's
 * `isRefetching`. Use this everywhere pull-to-refresh is wired.
 *
 * const { refreshing, handleRefresh } = useLocalRefresh(query.refetch);
 * <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
 *
 * Why: binding RefreshControl directly to TanStack's isRefetching leaks
 * state across screens (shared queryKey observers) and gets stuck when
 * the component unmounts mid-promise. A local flag + try/finally
 * guarantees the spinner always clears once the refetch resolves, and
 * the spinner only shows for user-initiated pulls — not background
 * refetches triggered by other components sharing the same queryKey.
 *
 * The `refetchFn` can be a single `query.refetch` or any async function —
 * wrap in `useCallback` to refetch multiple queries in parallel.
 */
export function useLocalRefresh(refetchFn: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchFn();
    } finally {
      setRefreshing(false);
    }
  }, [refetchFn]);
  return { refreshing, handleRefresh };
}
