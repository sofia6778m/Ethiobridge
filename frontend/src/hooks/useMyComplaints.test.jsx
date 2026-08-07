import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMyComplaints from './useMyComplaints';

const { mockReload, mockListeners } = vi.hoisted(() => ({
  mockReload: vi.fn(),
  mockListeners: [],
}));

vi.mock('./useComplaintList', () => ({
  default: () => ({
    data: { items: [{ id: 'a' }], counts: { All: 1, Infrastructure: 1, 'Public Complaint': 0 } },
    loading: false,
    refreshing: false,
    error: null,
    reload: mockReload,
  }),
}));

vi.mock('../services/complaintService', () => ({
  fetchMyComplaints: vi.fn(async () => ({ items: [], counts: {} })),
  onComplaintsChanged: (fn) => {
    mockListeners.push(fn);
    return () => {
      const i = mockListeners.indexOf(fn);
      if (i !== -1) mockListeners.splice(i, 1);
    };
  },
}));

beforeEach(() => {
  mockReload.mockClear();
  mockListeners.length = 0;
});

describe('useMyComplaints', () => {
  it('exposes complaints, counts and reload', () => {
    const { result } = renderHook(() => useMyComplaints());
    expect(result.current.complaints).toEqual([{ id: 'a' }]);
    expect(result.current.counts.All).toBe(1);
    expect(typeof result.current.reload).toBe('function');
    expect(result.current.loading).toBe(false);
  });

  it('subscribes to complaint changes and reloads when notified', () => {
    renderHook(() => useMyComplaints());
    expect(mockListeners).toHaveLength(1);
    act(() => mockListeners[0]());
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
