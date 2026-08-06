import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useSubcityOptions from './useSubcityOptions';
import { getWithRetry } from '../utils/requestUtils';

vi.mock('../utils/requestUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getWithRetry: vi.fn() };
});

const mockGet = getWithRetry;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { success: true, subcities: [{ _id: 'a', name: 'Bole' }] } });
});

describe('useSubcityOptions', () => {
  it('fetches the public subcity list once on mount and exposes normalized entries', async () => {
    const { result } = renderHook(() => useSubcityOptions());
    expect(result.current.subcitiesLoading).toBe(true);
    await waitFor(() => expect(result.current.subcitiesLoading).toBe(false));
    expect(result.current.subcities).toEqual([
      expect.objectContaining({ _id: 'a', name: 'Bole', value: 'a' }),
    ]);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe('/public/subcities');
  });

  it('does not refetch when the parent re-renders with a NEW onError callback', async () => {
    // Regression: an unstable inline onError used to change `load`'s identity,
    // which restarted the request on every keystroke — leaving the dropdown
    // stuck on "Loading subcities…".
    const onError = vi.fn();
    const { rerender } = renderHook(({ cb }) => useSubcityOptions({ onError: cb }), {
      initialProps: { cb: onError },
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    rerender({ cb: () => {} });
    rerender({ cb: () => {} });
    await act(async () => {});
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('falls back to the /subcities dropdown alias when the public endpoint fails', async () => {
    mockGet.mockRejectedValueOnce({ message: 'Network Error' });
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [{ _id: 'b', name: 'Yeka' }] } });
    const { result } = renderHook(() => useSubcityOptions());
    await waitFor(() => expect(result.current.subcitiesLoading).toBe(false));
    expect(mockGet.mock.calls[0][0]).toBe('/public/subcities');
    expect(mockGet.mock.calls[1][0]).toBe('/subcities');
    expect(result.current.subcities).toEqual([expect.objectContaining({ _id: 'b', name: 'Yeka' })]);
    expect(result.current.subcitiesError).toBe('');
  });

  it('sets a friendly error and calls onError when both endpoints fail', async () => {
    const onError = vi.fn();
    mockGet.mockRejectedValue({ message: 'Network Error' });
    const { result } = renderHook(() => useSubcityOptions({ onError }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(result.current.subcitiesError).toBe('Unable to load subcities. Please try again.');
    expect(result.current.subcitiesLoading).toBe(false);
    expect(result.current.subcities).toEqual([]);
  });

  it('does not call onError when the request is canceled on unmount', async () => {
    const onError = vi.fn();
    mockGet.mockImplementation((url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject({ name: 'AbortError', code: 'ERR_CANCELED' })
        );
      })
    );
    const { unmount } = renderHook(() => useSubcityOptions({ onError }));
    unmount();
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();
  });

  it('filters out inactive subcities and accepts the { data: [...] } shape', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          { _id: 'x', name: 'Bole', status: 'Active' },
          { _id: 'y', name: 'Yeka', status: 'Inactive' },
        ],
      },
    });
    const { result } = renderHook(() => useSubcityOptions());
    await waitFor(() => expect(result.current.subcitiesLoading).toBe(false));
    expect(result.current.subcities.map((s) => s.name)).toEqual(['Bole']);
  });

  it('reloadSubcities re-fetches the list on demand', async () => {
    const { result } = renderHook(() => useSubcityOptions());
    await waitFor(() => expect(result.current.subcitiesLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    await act(() => result.current.reloadSubcities());
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
