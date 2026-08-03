import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCacheStore, buildCacheKey, requestCache } from './requestCache';

describe('createCacheStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    requestCache.clear();
  });

  it('stores and returns values within TTL', () => {
    const cache = createCacheStore({ ttlMs: 1000 });
    cache.set('a', { x: 1 });
    expect(cache.get('a')).toEqual({ x: 1 });
  });

  it('expires entries after the TTL', () => {
    vi.useFakeTimers();
    const cache = createCacheStore({ ttlMs: 1000 });
    cache.set('a', { x: 1 });
    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toEqual({ x: 1 });
    vi.advanceTimersByTime(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('honours a per-set TTL', () => {
    vi.useFakeTimers();
    const cache = createCacheStore({ ttlMs: 1000 });
    cache.set('a', 1, 100);
    vi.advanceTimersByTime(150);
    expect(cache.get('a')).toBeUndefined();
  });

  it('isFresh reports whether the value is younger than maxAgeMs', () => {
    vi.useFakeTimers();
    const cache = createCacheStore({ ttlMs: 5000 });
    cache.set('a', 1, 5000);
    expect(cache.isFresh('a', 1000)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(cache.isFresh('a', 1000)).toBe(false);
  });

  it('isFresh is false for expired or missing entries', () => {
    vi.useFakeTimers();
    const cache = createCacheStore({ ttlMs: 100 });
    cache.set('a', 1);
    expect(cache.isFresh('a', 1_000_000)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(cache.isFresh('a', 1_000_000)).toBe(false);
    expect(cache.isFresh('missing', 1000)).toBe(false);
  });

  it('peek returns the value regardless of expiry', () => {
    vi.useFakeTimers();
    const cache = createCacheStore({ ttlMs: 100 });
    cache.set('a', { x: 1 });
    vi.advanceTimersByTime(200);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.peek('a')).toEqual({ x: 1 });
    expect(cache.peek('missing')).toBeUndefined();
  });

  it('evicts the oldest entry when over maxEntries', () => {
    const cache = createCacheStore({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('clear removes a single key or the whole store', () => {
    const cache = createCacheStore();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});

describe('buildCacheKey', () => {
  it('starts with method + url', () => {
    expect(buildCacheKey('GET', '/municipal-complaints')).toBe('GET /municipal-complaints');
  });

  it('omits empty / undefined / null params so "cleared search" equals "no search"', () => {
    const key = buildCacheKey('GET', '/municipal-complaints', { search: '', page: 1, woreda: null, extra: undefined });
    expect(key).not.toContain('search');
    expect(key).not.toContain('woreda');
    expect(key).not.toContain('extra');
    expect(key).toContain('page');
  });

  it('is stable regardless of param order', () => {
    const a = buildCacheKey('GET', '/x', { status: 'open', page: 2 });
    const b = buildCacheKey('GET', '/x', { page: 2, status: 'open' });
    expect(a).toBe(b);
  });

  it('drops the trailing query when params are all empty', () => {
    expect(buildCacheKey('GET', '/x', { search: '' })).toBe('GET /x');
  });
});
