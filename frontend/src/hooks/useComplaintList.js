import { useState, useEffect, useCallback, useRef } from 'react';
import { requestCache, buildCacheKey } from '../utils/requestCache';
import { isCanceledError, classifyError } from '../utils/requestUtils';

/**
 * Resilient list-data hook.
 *
 * - Caching: an identical query loaded recently is reused instantly, so
 *   switching between dashboard tabs does not re-fire the same request.
 * - Cancellation: the in-flight request is aborted when params change and on
 *   unmount, so a stale response can never overwrite newer data or surface a
 *   toast after the user has navigated away.
 * - Stale-while-revalidate: the last successful data stays visible while a new
 *   request runs; `refreshing` is exposed for a small inline indicator.
 * - Errors: `onError` is only called when the fetch truly failed (the fetcher
 *   should retry internally) and the request was not canceled.
 *
 * @param {Function} fetcher  (params, { signal }) => Promise<payload>
 */
export default function useComplaintList({
  fetcher,
  cacheKey,
  params,
  enabled = true,
  ttlMs = 30000,
  onError,
}) {
  const fullKey = buildCacheKey('GET', cacheKey, params);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const dataRef = useRef(null);

  const [data, setData] = useState(() => (enabled ? requestCache.get(fullKey) : null));
  const [loading, setLoading] = useState(() => !(enabled && requestCache.get(fullKey)));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  dataRef.current = data;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;

    const cached = requestCache.get(fullKey);
    const fresh = cached && requestCache.isFresh(fullKey, ttlMs);

    if (fresh) {
      setData(cached);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return () => { cancelled = true; };
    }

    // Keep whatever we already have on screen while refreshing: either the
    // (expired) cached response or the last successful data.
    const stale = requestCache.peek(fullKey) ?? dataRef.current;
    if (stale !== undefined && stale !== null) {
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    (async () => {
      try {
        const result = await fetcherRef.current(paramsRef.current, { signal });
        if (cancelled || signal.aborted) return;
        requestCache.set(fullKey, result, ttlMs);
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled || signal.aborted || isCanceledError(err)) return;
        setError(err);
        if (onErrorRef.current) onErrorRef.current(err, classifyError(err));
      } finally {
        if (!cancelled && !signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fullKey, enabled, ttlMs, version]);

  // Force a background refresh, bypassing the cache for this query.
  const reload = useCallback(() => {
    requestCache.clear(fullKey);
    setVersion((v) => v + 1);
  }, [fullKey]);

  return { data, loading, refreshing, error, reload };
}
