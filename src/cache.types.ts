import { Logger } from "./cache-logger";

export type CacheKey = (string | number)[];

export interface SetCacheParams<T> {
  key: CacheKey;
  data: T;
  staleTime?: number;
  cacheTime?: number;
}

export interface CacheEntryResult<T> {
  data: T | null;
  stale: boolean;
}

export interface CacheOptions {
  gcInterval?: number;
  defaultStaleTime?: number;
  defaultCacheTime?: number;
  debug?: boolean;
  logger?: Logger;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  staleTime: number;
  cacheTime: number;
}

export interface CacheStore {
  set<T>(params: SetCacheParams<T>): void;
  get<T>(key: CacheKey): CacheEntryResult<T>;
  invalidate(key: CacheKey): void;
  cleanUp(): void;
  stopGarbageCollector(): void;
}
