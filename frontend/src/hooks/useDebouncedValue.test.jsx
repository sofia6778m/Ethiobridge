import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDebouncedValue from './useDebouncedValue';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ v }) => useDebouncedValue(v, 600), {
      initialProps: { v: 'seed' },
    });
    expect(result.current).toBe('seed');
  });

  it('only updates after the delay elapses', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 600), {
      initialProps: { v: '' },
    });

    rerender({ v: 'hello' });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('hello');
  });

  it('resets the timer when the value keeps changing', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 600), {
      initialProps: { v: '' },
    });

    rerender({ v: 'a' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ v: 'ab' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('ab');
  });
});
