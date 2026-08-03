import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useComplaintList from './useComplaintList';
import { requestCache, buildCacheKey } from '../utils/requestCache';

const payload = (n) => ({ complaints: [`c-${n}`], total: 1, pages: 1 });
const cacheKeyFor = (params) => buildCacheKey('GET', 'municipal-complaints', params);

beforeEach(() => {
  requestCache.clear();
});

describe('useComplaintList', () => {
  it('fetches on mount and exposes the payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload(1));
    const { result } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'municipal-complaints', params: { page: 1 } })
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(payload(1)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('aborts the previous request when params change', async () => {
    const signals = [];
    const resolvers = [];
    const fetcher = vi.fn((params, { signal }) => {
      signals.push(signal);
      return new Promise((res) => resolvers.push(res));
    });

    const { rerender } = renderHook(
      ({ p }) => useComplaintList({ fetcher, cacheKey: 'municipal-complaints', params: p }),
      { initialProps: { p: { page: 1 } } }
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    rerender({ p: { page: 2 } });
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);

    // Settle the abandoned promise so nothing leaks.
    await act(async () => resolvers[0](payload(1)));
  });

  it('does not call onError for canceled requests', async () => {
    const onError = vi.fn();
    const fetcher = vi.fn((params, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject({ name: 'AbortError', code: 'ERR_CANCELED' })
        );
      })
    );

    const { rerender } = renderHook(
      ({ p }) => useComplaintList({ fetcher, cacheKey: 'k', params: p, onError }),
      { initialProps: { p: { page: 1 } } }
    );

    rerender({ p: { page: 2 } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not call onError on unmount while a request is in flight', async () => {
    const onError = vi.fn();
    const fetcher = vi.fn((params, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject({ name: 'AbortError', code: 'ERR_CANCELED' })
        );
      })
    );

    const { unmount } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'k', params: { page: 1 }, onError })
    );
    unmount();
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError once after a real (retry-exhausted) failure', async () => {
    const onError = vi.fn();
    const fetcher = vi.fn().mockRejectedValue({ message: 'boom', response: { status: 500 } });
    const { result } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'k', params: { page: 1 }, onError })
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][1]).toEqual({ kind: 'server' });
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });

  it('reuses a fresh cache on remount without refetching', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload(1));
    const render = (key) =>
      renderHook(({ k }) => useComplaintList({ fetcher, cacheKey: k, params: { page: 1 } }), {
        initialProps: { k: key },
      });

    const first = render('municipal-complaints');
    await waitFor(() => expect(first.result.current.data).toEqual(payload(1)));
    first.unmount();

    const second = render('municipal-complaints');
    expect(second.result.current.data).toEqual(payload(1));
    expect(second.result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('shows stale (expired) cache while refreshing in the background', async () => {
    const params = { page: 1 };
    requestCache.set(cacheKeyFor(params), payload('old'), 5);
    await new Promise((r) => setTimeout(r, 15));

    const fetcher = vi.fn().mockResolvedValue(payload('new'));
    const { result } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'municipal-complaints', params, ttlMs: 30000 })
    );

    expect(result.current.data).toEqual(payload('old'));
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);

    await waitFor(() => expect(result.current.data).toEqual(payload('new')));
    expect(result.current.refreshing).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reload clears the cache entry and refetches', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload(1));
    const params = { page: 1 };
    const fullKey = cacheKeyFor(params);
    requestCache.set(fullKey, payload('stale'), 60000);

    const { result } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'municipal-complaints', params, ttlMs: 60000 })
    );
    expect(result.current.data).toEqual(payload('stale'));
    expect(fetcher).toHaveBeenCalledTimes(0);

    act(() => result.current.reload());
    expect(requestCache.get(fullKey)).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(payload(1)));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps last successful data visible when a refresh fails', async () => {
    const params = { page: 1 };
    requestCache.set(cacheKeyFor(params), payload('old'), 5);
    await new Promise((r) => setTimeout(r, 15));

    const fetcher = vi.fn().mockRejectedValue({ message: 'down', response: { status: 500 } });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useComplaintList({ fetcher, cacheKey: 'municipal-complaints', params, onError })
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(result.current.data).toEqual(payload('old'));
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});
