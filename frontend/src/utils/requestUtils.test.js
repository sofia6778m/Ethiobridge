import { describe, it, expect, vi, beforeEach } from 'vitest';
import API from '../services/api';
import {
  getWithRetry,
  isCanceledError,
  isRetryableError,
  classifyError,
  sleep,
  backoffDelay,
  extractList,
} from './requestUtils';

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
}));

const mockGet = API.get;
const err = (status) => ({ message: 'boom', response: { status } });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  mockGet.mockClear();
});

describe('isCanceledError', () => {
  it('recognizes axios and abort signal cancellations', () => {
    expect(isCanceledError({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isCanceledError({ name: 'AbortError' })).toBe(true);
    expect(isCanceledError({ code: 'ERR_ABORTED' })).toBe(true);
    expect(isCanceledError({ __CANCELED__: true })).toBe(true);
    expect(isCanceledError({ axiosError: { code: 'ERR_CANCELED' } })).toBe(true);
    expect(isCanceledError(err(500))).toBe(false);
    expect(isCanceledError(undefined)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('retries network failures (no response), timeouts, 429 and 5xx', () => {
    expect(isRetryableError({ message: 'Network Error' })).toBe(true);
    expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true);
    expect(isRetryableError(err(429))).toBe(true);
    expect(isRetryableError(err(500))).toBe(true);
    expect(isRetryableError(err(503))).toBe(true);
  });

  it('does not retry 4xx or canceled requests', () => {
    expect(isRetryableError(err(400))).toBe(false);
    expect(isRetryableError(err(401))).toBe(false);
    expect(isRetryableError(err(404))).toBe(false);
    expect(isRetryableError({ code: 'ERR_CANCELED' })).toBe(false);
  });
});

describe('classifyError', () => {
  it('classifies common error kinds', () => {
    expect(classifyError({ name: 'AbortError' })).toEqual({ kind: 'canceled' });
    expect(classifyError({ code: 'ECONNABORTED' })).toEqual({ kind: 'timeout' });
    expect(classifyError({ message: 'Network Error' })).toEqual({ kind: 'offline' });
    expect(classifyError(err(401))).toEqual({ kind: 'unauthorized' });
    expect(classifyError(err(403))).toEqual({ kind: 'forbidden' });
    expect(classifyError(err(404))).toEqual({ kind: 'notfound' });
    expect(classifyError(err(429))).toEqual({ kind: 'rate_limit' });
    expect(classifyError(err(502))).toEqual({ kind: 'server' });
    expect(classifyError(err(418))).toEqual({ kind: 'unknown' });
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with the attempt number', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(backoffDelay(500, 1)).toBe(500);
    expect(backoffDelay(500, 2)).toBe(1000);
    expect(backoffDelay(500, 3)).toBe(2000);
  });
});

describe('sleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    const p = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects early when the signal aborts', async () => {
    const controller = new AbortController();
    const p = sleep(10000, controller.signal);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('getWithRetry', () => {
  it('returns the response on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { ok: true } });
    const res = await getWithRetry('/x', {});
    expect(res).toEqual({ data: { ok: true } });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]).toMatchObject({ timeout: 15000 });
  });

  it('retries retryable failures then succeeds', async () => {
    mockGet.mockRejectedValueOnce(err(500));
    mockGet.mockResolvedValueOnce({ data: { ok: true } });
    const res = await getWithRetry('/x', { baseDelay: 1 });
    expect(res).toEqual({ data: { ok: true } });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('throws once the retry budget is exhausted', async () => {
    mockGet.mockRejectedValue(err(500));
    await expect(getWithRetry('/x', { retries: 2, baseDelay: 1 })).rejects.toEqual(err(500));
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    mockGet.mockRejectedValue(err(404));
    await expect(getWithRetry('/x', { retries: 3, baseDelay: 1 })).rejects.toEqual(err(404));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('does not retry canceled requests', async () => {
    const cancel = { name: 'AbortError', code: 'ERR_CANCELED' };
    mockGet.mockRejectedValue(cancel);
    await expect(getWithRetry('/x', { retries: 3, baseDelay: 1 })).rejects.toBe(cancel);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('aborts the retry backoff when the signal fires mid-wait', async () => {
    const controller = new AbortController();
    mockGet.mockRejectedValue(err(500));
    const p = getWithRetry('/x', { retries: 3, baseDelay: 10000, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('forwards params and signal to the transport', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    const controller = new AbortController();
    await getWithRetry('/x', { params: { page: 2 }, signal: controller.signal });
    expect(mockGet.mock.calls[0][1]).toMatchObject({ params: { page: 2 }, signal: controller.signal });
  });
});

describe('extractList', () => {
  it('extracts the array from every response shape the API returns', () => {
    expect(extractList({ data: { success: true, subcities: [{ _id: '1' }] } }, 'subcities')).toEqual([{ _id: '1' }]);
    expect(extractList({ data: { success: true, data: [{ _id: '2' }] } }, 'subcities')).toEqual([{ _id: '2' }]);
    expect(extractList({ data: { success: true, data: { subcities: [{ _id: '3' }] } } }, 'subcities')).toEqual([{ _id: '3' }]);
    expect(extractList({ data: { success: true, woredas: [{ _id: '4' }] } }, 'woredas')).toEqual([{ _id: '4' }]);
    expect(extractList({ data: { success: true, data: [{ _id: '5' }] } }, 'woredas')).toEqual([{ _id: '5' }]);
  });

  it('returns [] instead of crashing on null, empty or malformed payloads', () => {
    expect(extractList({ data: null }, 'subcities')).toEqual([]);
    expect(extractList({}, 'subcities')).toEqual([]);
    expect(extractList({ data: { success: true } }, 'subcities')).toEqual([]);
    expect(extractList({ data: { success: true, subcities: 'nope' } }, 'subcities')).toEqual([]);
    expect(extractList(undefined, 'subcities')).toEqual([]);
    expect(extractList(null, 'subcities')).toEqual([]);
  });
});
