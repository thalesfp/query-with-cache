import isEqual from "fast-deep-equal";

import { CacheKey, CacheStore } from "./cache.types";

type FetchFunction<T> = () => Promise<T>;

interface QueryWithCacheParams<T> {
  queryKey: CacheKey;
  cacheExpirationTime?: number;
  cacheStoredTime?: number;
  cache: CacheStore;
  queryFn: FetchFunction<T>;
  onData: (data: T) => void;
  onIsFetching?: (isFetching: boolean) => void;
  onError?: (error: unknown) => void;
}

export const queryWithCache = async <T>({
  queryKey,
  cacheExpirationTime,
  cacheStoredTime,
  cache,
  queryFn,
  onData,
  onIsFetching,
  onError,
}: QueryWithCacheParams<T>) => {
  const cacheEntry = cache.get<T>(queryKey);
  const shouldCallIsFetching = !cacheEntry.data && !!onIsFetching;

  if (cacheEntry.data) {
    onData(cacheEntry.data);

    if (!cacheEntry.stale) {
      return;
    }
  }

  if (shouldCallIsFetching) {
    onIsFetching(true);
  }

  try {
    const result = await queryFn();

    if (!isEqual(result, cacheEntry.data)) {
      onData(result);
    }

    cache.set({
      key: queryKey,
      data: result,
      cacheTime: cacheStoredTime,
      staleTime: cacheExpirationTime,
    });
  } catch (error) {
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
  } finally {
    if (shouldCallIsFetching) {
      onIsFetching(false);
    }
  }
};
