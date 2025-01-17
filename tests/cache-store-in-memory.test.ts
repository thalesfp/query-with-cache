import { CacheStoreInMemory } from "../src/cache-store-in-memory";
import { ConsoleLogger } from "../src/cache-logger";
import { DEFAULT_STALE_TIME } from "../src/cache.constants";

describe("CacheStoreInMemory", () => {
  let cache: CacheStoreInMemory;
  let mockLogger: jest.Mocked<ConsoleLogger>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockLogger = {
      log: jest.fn(),
    };
    cache = new CacheStoreInMemory({
      debug: true,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    cache.stopGarbageCollector();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("Basic Cache Operations", () => {
    it("should store and retrieve data", () => {
      const testData = { test: "value" };
      cache.set({ key: ["test"], data: testData });

      const result = cache.get(["test"]);
      expect(result.data).toEqual(testData);
      expect(result.stale).toBe(false);
    });

    it("should return null for non-existent keys", () => {
      const result = cache.get(["nonexistent"]);
      expect(result.data).toBeNull();
      expect(result.stale).toBe(false);
    });

    it("should handle nested keys", () => {
      const testData = { test: "nested" };
      cache.set({ key: ["parent", "child"], data: testData });

      const result = cache.get(["parent", "child"]);
      expect(result.data).toEqual(testData);
    });
  });

  describe("Cache Invalidation", () => {
    beforeEach(() => {
      cache.set({
        key: ["parent", "child1"],
        data: "data1",
      });
      cache.set({
        key: ["parent", "child2"],
        data: "data2",
      });
    });

    it("should invalidate specific cache entry", () => {
      cache.invalidate(["parent", "child1"]);

      expect(cache.get(["parent", "child1"]).data).toBeNull();
      expect(cache.get(["parent", "child2"]).data).toBe("data2");
    });

    it("should invalidate parent key and all children", () => {
      cache.invalidate(["parent"]);

      expect(cache.get(["parent", "child1"]).data).toBeNull();
      expect(cache.get(["parent", "child2"]).data).toBeNull();
    });
  });

  describe("Stale and Cache Time Behavior", () => {
    const testData = { test: "stale-test" };

    it("should mark data as stale after staleTime", () => {
      cache.set({
        key: ["test"],
        data: testData,
        staleTime: 1000,
      });

      expect(cache.get(["test"]).stale).toBe(false);

      jest.advanceTimersByTime(1001);

      expect(cache.get(["test"]).stale).toBe(true);
      expect(cache.get(["test"]).data).toEqual(testData);
    });

    it("should use default stale and cache times when not provided", () => {
      cache.set({ key: ["test"], data: testData });

      expect(cache.get(["test"]).stale).toBe(false);

      jest.advanceTimersByTime(DEFAULT_STALE_TIME + 1);

      expect(cache.get(["test"]).stale).toBe(true);
    });

    it("should respect custom stale and cache times", () => {
      const customStaleTime = 500;
      cache.set({
        key: ["test"],
        data: testData,
        staleTime: customStaleTime,
      });

      jest.advanceTimersByTime(customStaleTime - 1);
      expect(cache.get(["test"]).stale).toBe(false);

      jest.advanceTimersByTime(2);
      expect(cache.get(["test"]).stale).toBe(true);
    });
  });

  describe("Garbage Collection", () => {
    it("should remove expired entries during manual cleanup", () => {
      cache.set({
        key: ["test1"],
        data: "data1",
        cacheTime: 1000,
      });
      cache.set({
        key: ["test2"],
        data: "data2",
        cacheTime: 2000,
      });

      jest.advanceTimersByTime(1500);
      cache.cleanUp();

      expect(cache.get(["test1"]).data).toBeNull();
      expect(cache.get(["test2"]).data).toBe("data2");
    });

    it("should perform automatic garbage collection", () => {
      cache = new CacheStoreInMemory({
        gcInterval: 1000,
        debug: true,
        logger: mockLogger,
      });

      cache.set({
        key: ["test"],
        data: "data",
        cacheTime: 500,
      });

      jest.advanceTimersByTime(1500);

      expect(cache.get(["test"]).data).toBeNull();
    });

    it("should not remove non-expired entries during cleanup", () => {
      cache.set({
        key: ["test"],
        data: "data",
        cacheTime: 2000,
      });

      jest.advanceTimersByTime(1000);
      cache.cleanUp();

      expect(cache.get(["test"]).data).toBe("data");
    });
  });

  describe("Debug Logging", () => {
    it("should log debug messages when debug is enabled", () => {
      const testData = { test: "log-test" };
      cache.set({ key: ["test"], data: testData });

      expect(mockLogger.log).toHaveBeenCalledWith(
        "[Cache Debug]",
        "Set:",
        ["test"],
        expect.any(Object)
      );
    });

    it("should not log when debug is disabled", () => {
      cache = new CacheStoreInMemory({ debug: false });
      cache.set({ key: ["test"], data: "test" });

      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty keys", () => {
      cache.set({ key: [], data: "test" });
      expect(cache.get([]).data).toBeNull();
    });

    it("should handle undefined values", () => {
      cache.set({ key: ["test"], data: undefined });
      expect(cache.get(["test"]).data).toBeUndefined();
    });

    it("should handle complex nested structures", () => {
      const complexData = {
        nested: { deep: { value: "test" } },
        array: [1, 2, { x: "y" }],
      };

      cache.set({ key: ["complex"], data: complexData });
      expect(cache.get(["complex"]).data).toEqual(complexData);
    });

    it("should handle multiple cache entries at different levels", () => {
      cache.set({ key: ["a"], data: "1" });
      cache.set({ key: ["a", "b"], data: "2" });
      cache.set({ key: ["a", "b", "c"], data: "3" });

      expect(cache.get(["a"]).data).toBe("1");
      expect(cache.get(["a", "b"]).data).toBe("2");
      expect(cache.get(["a", "b", "c"]).data).toBe("3");
    });
  });
});
