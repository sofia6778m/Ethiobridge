// Resilient GET helpers: automatic retry with exponential backoff, abort
// support (AbortController), and graceful error classification. Used by the
// dashboard list/detail pages so a slow or briefly unavailable backend never
// produces repeated error toasts while typing or switching tabs.

import API from '../services/api';

// Extracts an array from the many response shapes the API returns. Never
// returns null/undefined — callers can safely map over the result.
//   { subcities: [...] }                 /api/public/subcities, /api/admin/subcities
//   { data: [...] }                      /api/subcities, /api/woredas?subcityId=
//   { data: { subcities: [...] } }       legacy nested shape
//   { data: { woredas: [...] } }         /api/public-complaints/subcity-woredas
export const extractList = (res, key) => {
  const body = res?.data && typeof res.data === 'object' ? res.data : res;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body;
  if (key && Array.isArray(body[key])) return body[key];
  const nested = body.data;
  if (Array.isArray(nested)) return nested;
  if (key && nested && typeof nested === 'object') {
    if (Array.isArray(nested[key])) return nested[key];
    if (Array.isArray(nested.data?.[key])) return nested.data[key];
  }
  return [];
};

export const DEFAULT_RETRIES = 2;
export const DEFAULT_BASE_DELAY_MS = 500;
export const DEFAULT_TIMEOUT_MS = 15000;

// Was the request canceled by an AbortController? Canceled requests are not
// real failures — callers ignore them so no toast appears after navigation.
export const isCanceledError = (err) =>
  !!(err && (
    err.code === 'ERR_CANCELED' ||
    err.code === 'ERR_ABORTED' ||
    err.name === 'AbortError' ||
    err.__CANCELED__ ||
    err.axiosError?.code === 'ERR_CANCELED'
  ));

// Requests worth retrying: network failures (offline / no response), timeouts
// and 5xx / 429 server errors. 4xx (auth, permission, not found) are not.
export const isRetryableError = (err) => {
  if (!err || isCanceledError(err)) return false;
  if (!err.response) return true;
  const status = err.response.status;
  return status === 429 || status >= 500;
};

export const classifyError = (err) => {
  if (isCanceledError(err)) return { kind: 'canceled' };
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
      return { kind: 'timeout' };
    }
    return { kind: 'offline' };
  }
  switch (err.response.status) {
    case 401: return { kind: 'unauthorized' };
    case 403: return { kind: 'forbidden' };
    case 404: return { kind: 'notfound' };
    case 429: return { kind: 'rate_limit' };
    default:
      return err.response.status >= 500 ? { kind: 'server' } : { kind: 'unknown' };
  }
};

// Delay that also rejects early if the caller's signal aborts mid-wait.
const makeAbortError = () => {
  const abortErr = new Error('The request was aborted.');
  abortErr.name = 'AbortError';
  abortErr.code = 'ERR_CANCELED';
  return abortErr;
};

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(makeAbortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(makeAbortError());
      }, { once: true });
    }
  });

// Exponential backoff with jitter so concurrent retries do not line up.
export const backoffDelay = (baseDelayMs, attempt) =>
  baseDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4);

// GET with up to `retries` automatic retries. Only throws once the retry budget
// is exhausted or the failure is non-retryable (or the request was canceled).
export const getWithRetry = async (url, {
  params,
  signal,
  retries = DEFAULT_RETRIES,
  baseDelay = DEFAULT_BASE_DELAY_MS,
  timeout = DEFAULT_TIMEOUT_MS,
} = {}) => {
  let attempt = 0;
  for (;;) {
    try {
      return await API.get(url, { params, signal, timeout });
    } catch (err) {
      if (isCanceledError(err) || !isRetryableError(err)) throw err;
      if (attempt >= retries) throw err;
      attempt += 1;
      await sleep(backoffDelay(baseDelay, attempt), signal);
    }
  }
};
