import { MMKV } from "react-native-mmkv";

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

export class CacheStoreMMKV implements CacheStore {
  private gcIntervalId: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;
  private mmkvInstance: MMKV;

  constructor(
    private options: CacheOptions = {
      gcInterval: DEFAULT_GC_INTERVAL,
      defaultStaleTime: DEFAULT_STALE_TIME,
      defaultCacheTime: DEFAULT_CACHE_TIME,
      debug: false,
      logger: new ConsoleLogger(),
    }
  ) {
    this.mmkvInstance = new MMKV({
      id: "network-cache",
    });
    this.logger = this.options.logger || new ConsoleLogger();
    this.startGarbageCollector(this.options.gcInterval ?? DEFAULT_GC_INTERVAL);
  }

  private debugLog(...messages: any[]): void {
    if (this.options.debug) {
      this.logger.log("[Cache Debug]", ...messages);
    }
  }

  /**
   * Converts a CacheKey array into a single string key.
   */
  private keyToString(key: CacheKey): string {
    return key.join(":");
  }

  set<T>({ key, data, staleTime, cacheTime }: SetCacheParams<T>): void {
    if (key.length === 0) {
      this.logger.log("Invalid key:", key);
      return;
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      staleTime:
        staleTime ?? this.options.defaultStaleTime ?? DEFAULT_STALE_TIME,
      cacheTime:
        cacheTime ?? this.options.defaultCacheTime ?? DEFAULT_CACHE_TIME,
    };

    this.mmkvInstance.set(this.keyToString(key), JSON.stringify(entry));
    this.debugLog("Set:", key, entry);
  }

  get<T>(key: CacheKey): { data: T | null; stale: boolean } {
    const storedValue = this.mmkvInstance.getString(this.keyToString(key));

    if (!storedValue) {
      this.debugLog("Get (miss):", key);
      return { data: null, stale: false };
    }

    const entry = JSON.parse(storedValue) as CacheEntry<T>;
    const isStale = this.isStale(entry);

    this.debugLog("Get (hit):", key, entry, "Stale:", isStale);
    return { data: entry.data, stale: isStale };
  }

  private isStale<T>(entry: CacheEntry<T>): boolean {
    const isStale = Date.now() - entry.timestamp > entry.staleTime;

    if (this.options.debug) {
      const timePassedInSeconds = (Date.now() - entry.timestamp) / 1000;

      this.debugLog(
        "Checking stale:",
        isStale ? "Stale," : "Fresh,",
        "Time passed:",
        timePassedInSeconds,
        "seconds"
      );
    }

    return Date.now() - entry.timestamp > entry.staleTime;
  }

  invalidate(path: CacheKey): void {
    const keyToDelete = this.keyToString(path);
    const allKeys = this.mmkvInstance.getAllKeys();

    // For exact match, also remove if the path itself is a key
    // For hierarchy, remove any keys that start with "path:".
    // If path = 'customers', this will remove 'customers', 'customers:customer:1', 'customers:all', etc.
    // If path = 'customers:customer', this removes any keys starting with 'customers:customer:'.
    // If path = 'customers:customer:2', this removes only that exact key.
    const keysToDelete = allKeys.filter((key) => {
      if (key === keyToDelete) {
        // Direct match
        return true;
      }
      // Hierarchical match: key should start with "path:" to remove descendants
      return key.startsWith(path + ":");
    });

    for (const k of keysToDelete) {
      this.mmkvInstance.delete(k);
    }

    this.debugLog("Invalidate:", keyToDelete);
  }

  cleanUp(): void {
    const currentTime = Date.now();
    this.debugLog("Running manual cleanup...");
    const keys = this.mmkvInstance.getAllKeys();

    for (const keyStr of keys) {
      const storedValue = this.mmkvInstance.getString(keyStr);
      if (!storedValue) continue;

      const entry = JSON.parse(storedValue) as CacheEntry<unknown>;
      const isExpired = currentTime - entry.timestamp > entry.cacheTime;
      if (isExpired) {
        this.mmkvInstance.delete(keyStr);
        this.debugLog("Garbage collected:", keyStr);
      }
    }
  }

  private startGarbageCollector(gcInterval: number) {
    if (!this.gcIntervalId) {
      this.gcIntervalId = setInterval(() => {
        this.debugLog("Running automatic garbage collection...");
        this.cleanUp();
      }, gcInterval);
    }
  }

  stopGarbageCollector() {
    if (this.gcIntervalId) {
      clearInterval(this.gcIntervalId);
      this.gcIntervalId = null;
      this.debugLog("Stopped garbage collection");
    }
  }
}
