import { ConsoleLogger, Logger } from "./cache-logger";
import {
  DEFAULT_CACHE_TIME,
  DEFAULT_GC_INTERVAL,
  DEFAULT_STALE_TIME,
} from "./cache.constants";
import {
  CacheEntry,
  CacheKey,
  CacheOptions,
  CacheStore,
  SetCacheParams,
} from "./cache.types";

type CacheStoreMap = Map<string | number, CacheStoreMap | CacheEntry<unknown>>;

export class CacheStoreInMemory implements CacheStore {
  private store: CacheStoreMap = new Map();
  private gcIntervalId: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  /**
   * Creates a cache instance with optional garbage collection, stale, and cache times.
   * @param {CacheOptions} options - Configuration options for the cache.
   */
  constructor(
    private options: CacheOptions = {
      gcInterval: DEFAULT_GC_INTERVAL,
      defaultStaleTime: DEFAULT_STALE_TIME,
      defaultCacheTime: DEFAULT_CACHE_TIME,
      debug: false,
      logger: new ConsoleLogger(),
    }
  ) {
    this.logger = this.options.logger || new ConsoleLogger();
    this.startGarbageCollector(this.options.gcInterval ?? DEFAULT_GC_INTERVAL);
  }

  /**
   * Log messages if debug is enabled
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private debugLog(...messages: any[]): void {
    if (this.options.debug) {
      this.logger.log("[Cache Debug]", ...messages);
    }
  }

  /**
   * Recursively traverses or creates nodes in the cache store for a given key path.
   * @param {CacheStoreMap} map - The current map (node) in the cache store.
   * @param {CacheKey} key - The hierarchical key used for cache storage.
   * @returns {CacheStoreMap} The node (map) that corresponds to the last key part.
   */
  private getOrCreateNode(map: CacheStoreMap, key: CacheKey): CacheStoreMap {
    let current = map;
    for (const part of key) {
      if (!current.has(part)) {
        current.set(part, new Map());
      }
      current = current.get(part) as CacheStoreMap;
    }
    return current;
  }

  /**
   * Retrieves a node or entry for a given key path from the cache store.
   * @param {CacheStoreMap} map - The current map (node) in the cache store.
   * @param {CacheKey} key - The hierarchical key used for cache storage.
   * @returns {CacheStoreMap | CacheEntry<unknown> | undefined} The node or entry for the given key.
   */
  private getNode(
    map: CacheStoreMap,
    key: CacheKey
  ): CacheStoreMap | CacheEntry<unknown> | undefined {
    let current: CacheStoreMap | CacheEntry<unknown> | undefined = map;
    for (const part of key) {
      if (!(current instanceof Map)) {
        return undefined;
      }
      current = current.get(part);
    }
    return current;
  }

  /**
   * Adds or updates a cache entry for a given key.
   * @param {SetCacheParams<T>} params - The cache entry data and configuration.
   */
  set<T>({ key, data, staleTime, cacheTime }: SetCacheParams<T>): void {
    if (key.length === 0) {
      this.logger.log("Invalid key:", key);
      return;
    }

    const node = this.getOrCreateNode(this.store, key);

    const cacheEntry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      staleTime:
        staleTime ?? this.options.defaultStaleTime ?? DEFAULT_STALE_TIME,
      cacheTime:
        cacheTime ?? this.options.defaultCacheTime ?? DEFAULT_CACHE_TIME,
    };

    node.set("cacheEntry", cacheEntry);

    this.debugLog("Set:", key, cacheEntry);
  }

  /**
   * Retrieves a cache entry for a given key, along with its stale status.
   * @param {CacheKey} key - The key used to retrieve the cache entry.
   * @returns { { data: T | null, stale: boolean } } The cached data and stale status.
   */
  get<T>(key: CacheKey): { data: T | null; stale: boolean } {
    const node = this.getNode(this.store, key);
    if (!node || !(node instanceof Map) || !node.has("cacheEntry")) {
      this.debugLog("Get (miss):", key);
      return { data: null, stale: false };
    }

    const entry = node.get("cacheEntry") as CacheEntry<T>;
    const isStale = this.isStale(entry);

    this.debugLog("Get (hit):", key, entry, "Stale:", isStale);
    return { data: entry.data, stale: isStale };
  }

  /**
   * Checks if a cache entry is stale.
   * @param {CacheEntry<T>} entry - The cache entry to check.
   * @returns {boolean} True if the entry is stale, false otherwise.
   */
  private isStale<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.staleTime;
  }

  /**
   * Invalidates (removes) a cache entry for a given key.
   * @param {CacheKey} key - The key of the entry to invalidate.
   */
  invalidate(key: CacheKey): void {
    const parentNode = this.getNode(this.store, key.slice(0, -1)) as
      | CacheStoreMap
      | undefined;
    const lastKey = key[key.length - 1];
    if (parentNode && parentNode instanceof Map) {
      parentNode.delete(lastKey);
      this.debugLog("Invalidate:", key);
    }
  }

  /**
   * Manually triggers cache cleanup (garbage collection) by removing expired entries.
   */
  cleanUp(): void {
    const currentTime = Date.now();
    this.debugLog("Running manual cleanup...");
    this.cleanUpNode(this.store, currentTime);
  }

  /**
   * Recursively cleans up expired cache entries in the cache store.
   * @param {CacheStoreMap} node - The current node in the cache store.
   * @param {number} currentTime - The current timestamp for checking expiration.
   */
  private cleanUpNode(node: CacheStoreMap, currentTime: number): void {
    for (const [key, value] of node) {
      if (value instanceof Map) {
        this.cleanUpNode(value, currentTime);
      } else {
        const entry = value as CacheEntry<unknown>;
        const isExpired = currentTime - entry.timestamp > entry.cacheTime;
        if (isExpired) {
          node.delete(key);
          this.debugLog("Garbage collected:", key);
        }
      }
    }
  }

  /**
   * Starts the automatic garbage collection process at the specified interval.
   * @param {number} gcInterval - The interval (in milliseconds) at which garbage collection occurs.
   */
  private startGarbageCollector(gcInterval: number) {
    if (!this.gcIntervalId) {
      this.gcIntervalId = setInterval(() => {
        this.debugLog("Running automatic garbage collection...");
        this.cleanUp();
      }, gcInterval);
    }
  }

  /**
   * Stops the automatic garbage collection process.
   */
  stopGarbageCollector() {
    if (this.gcIntervalId) {
      clearInterval(this.gcIntervalId);
      this.gcIntervalId = null;
      this.debugLog("Stopped garbage collection");
    }
  }
}
