import { queryWithCache } from "../src/query-with-cache";
import { CacheStoreInMemory } from "../src/cache-store-in-memory";

describe("queryWithCache", () => {
  const mockQueryResult = { title: "new entry" };
  let cache: CacheStoreInMemory;
  let fetchData: jest.Mock;
  let handleData: jest.Mock;
  let handleLoading: jest.Mock;
  let handleError: jest.Mock;

  beforeEach(() => {
    cache = new CacheStoreInMemory();

    fetchData = jest.fn().mockResolvedValue(mockQueryResult);
    handleData = jest.fn();
    handleLoading = jest.fn();
    handleError = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    cache.stopGarbageCollector();
  });

  describe("Cache Miss Behavior", () => {
    beforeEach(async () => {
      await queryWithCache({
        queryKey: ["test"],
        queryFn: fetchData,
        onData: handleData,
        onIsFetching: handleLoading,
        cache,
      });
    });

    it("should fetch and cache new data when cache is empty", () => {
      expect(handleData).toHaveBeenCalledWith(mockQueryResult);

      expect(cache.get(["test"])).toEqual({
        data: mockQueryResult,
        stale: false,
      });
    });

    it("should manage loading state during fetch", () => {
      expect(handleLoading).toHaveBeenCalledTimes(2);
      expect(handleLoading).toHaveBeenNthCalledWith(1, true);
      expect(handleLoading).toHaveBeenNthCalledWith(2, false);
    });
  });

  describe("Fresh Cache Behavior", () => {
    const cachedData = { title: "cached" };

    beforeEach(async () => {
      cache.set({
        key: ["test"],
        data: cachedData,
        cacheTime: 1000,
        staleTime: 1000,
      });

      await queryWithCache({
        queryKey: ["test"],
        queryFn: fetchData,
        onData: handleData,
        onIsFetching: handleLoading,
        cache,
      });
    });

    it("should return cached data without fetching when cache is fresh", () => {
      expect(handleData).toHaveBeenCalledWith(cachedData);
      expect(fetchData).not.toHaveBeenCalled();
    });

    it("should preserve cache state when using fresh data", () => {
      expect(cache.get(["test"])).toEqual({
        data: cachedData,
        stale: false,
      });
    });

    it("should not trigger loading state for fresh cache", () => {
      expect(handleLoading).not.toHaveBeenCalled();
    });
  });

  describe("Stale Cache Behavior", () => {
    const staleData = { title: "cached" };

    beforeEach(async () => {
      jest.useFakeTimers();
      cache.set({
        key: ["test"],
        data: staleData,
        cacheTime: 1000,
        staleTime: 1000,
      });

      jest.advanceTimersByTime(2000);

      await queryWithCache({
        queryKey: ["test"],
        queryFn: fetchData,
        onData: handleData,
        cache,
      });
    });

    it("should handle stale cache by returning cached data then fetching new data", () => {
      expect(handleData).toHaveBeenCalledTimes(2);
      expect(handleData).toHaveBeenNthCalledWith(1, staleData);
      expect(handleData).toHaveBeenNthCalledWith(2, mockQueryResult);
    });

    it("should update cache with fresh data after stale hit", () => {
      expect(cache.get(["test"])).toEqual({
        data: mockQueryResult,
        stale: false,
      });
    });

    it("should not trigger loading state for stale cache updates", () => {
      expect(handleLoading).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    const queryError = new Error("Failed to fetch data");

    describe("with error callback", () => {
      beforeEach(async () => {
        fetchData.mockRejectedValue(queryError);

        await queryWithCache({
          queryKey: ["test"],
          queryFn: fetchData,
          onData: handleData,
          onIsFetching: handleLoading,
          onError: handleError,
          cache,
        });
      });

      it("should handle query failures appropriately", () => {
        expect(handleData).not.toHaveBeenCalled();
        expect(handleError).toHaveBeenCalledWith(queryError);
      });

      it("should not cache failed query results", () => {
        expect(cache.get(["test"])).toEqual({
          data: null,
          stale: false,
        });
      });

      it("should properly manage loading state during errors", () => {
        expect(handleLoading).toHaveBeenCalledTimes(2);
        expect(handleLoading).toHaveBeenNthCalledWith(1, true);
        expect(handleLoading).toHaveBeenNthCalledWith(2, false);
      });
    });

    describe("without error callback", () => {
      it("should throw the error when no error callback is provided", async () => {
        fetchData.mockRejectedValue(queryError);

        const queryPromise = queryWithCache({
          queryKey: ["test"],
          queryFn: fetchData,
          onData: handleData,
          onIsFetching: handleLoading,
          cache,
        });

        await expect(queryPromise).rejects.toThrow(queryError);
      });

      it("should properly manage loading state even when throwing", async () => {
        fetchData.mockRejectedValue(queryError);

        try {
          await queryWithCache({
            queryKey: ["test"],
            queryFn: fetchData,
            onData: handleData,
            onIsFetching: handleLoading,
            cache,
          });
        } catch (error) {
          // Ignore the error as we're testing loading state
        }

        expect(handleLoading).toHaveBeenCalledTimes(2);
        expect(handleLoading).toHaveBeenNthCalledWith(1, true);
        expect(handleLoading).toHaveBeenNthCalledWith(2, false);
      });
    });
  });

  describe("Cache Invalidation with Nested Keys", () => {
    const nestedKey = ["this", "is", "my", "key"];
    const nestedData = { value: "nested data" };

    beforeEach(async () => {
      cache.set({
        key: nestedKey,
        data: nestedData,
        cacheTime: 1000,
        staleTime: 1000,
      });
    });

    describe("when invalidating the complete key", () => {
      beforeEach(async () => {
        cache.invalidate(nestedKey);
      });

      it("should remove the cache entry", () => {
        expect(cache.get(nestedKey)).toEqual({
          data: null,
          stale: false,
        });
      });

      it("should fetch new data on next query", async () => {
        await queryWithCache({
          queryKey: nestedKey,
          queryFn: fetchData,
          onData: handleData,
          cache,
        });

        expect(fetchData).toHaveBeenCalled();
        expect(handleData).toHaveBeenCalledWith(mockQueryResult);
      });
    });

    describe("when invalidating a parent key", () => {
      beforeEach(async () => {
        cache.invalidate(["this"]);
      });

      it("should remove all nested cache entries", () => {
        expect(cache.get(nestedKey)).toEqual({
          data: null,
          stale: false,
        });
      });

      it("should fetch new data on next query of any nested key", async () => {
        await queryWithCache({
          queryKey: nestedKey,
          queryFn: fetchData,
          onData: handleData,
          cache,
        });

        expect(fetchData).toHaveBeenCalled();
        expect(handleData).toHaveBeenCalledWith(mockQueryResult);
      });
    });

    describe("when invalidating a sibling key", () => {
      beforeEach(async () => {
        cache.invalidate(["this", "is", "another", "key"]);
      });

      it("should preserve the original cache entry", () => {
        expect(cache.get(nestedKey)).toEqual({
          data: nestedData,
          stale: false,
        });
      });

      it("should not trigger fetch for the preserved cache entry", async () => {
        await queryWithCache({
          queryKey: nestedKey,
          queryFn: fetchData,
          onData: handleData,
          cache,
        });

        expect(fetchData).not.toHaveBeenCalled();
        expect(handleData).toHaveBeenCalledWith(nestedData);
      });
    });
  });
});
