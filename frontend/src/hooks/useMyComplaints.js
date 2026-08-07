import { useEffect } from 'react';
import useComplaintList from './useComplaintList';
import { fetchMyComplaints, onComplaintsChanged } from '../services/complaintService';

/**
 * useMyComplaints
 * ───────────────
 * Feeds the citizen "My Complaints" page. Wraps the reusable useComplaintList
 * hook around the single complaintService fetcher so every dashboard that needs
 * a citizen's combined complaint list shares one data path, one cache and one
 * error-handling strategy.
 *
 * It also subscribes to complaintService's change notifications: any successful
 * submission anywhere in the app invalidates the cached list and refetches, so
 * a freshly created complaint appears immediately without a manual refresh.
 */
export default function useMyComplaints({ enabled = true } = {}) {
  const { data, loading, refreshing, error, reload } = useComplaintList({
    fetcher: (params, { signal }) => fetchMyComplaints({ signal }),
    cacheKey: 'citizen-my-complaints',
    params: {},
    enabled,
    ttlMs: 15000,
  });

  useEffect(() => onComplaintsChanged(() => reload()), [reload]);

  return {
    complaints: data?.items || [],
    counts: data?.counts || { All: 0, Infrastructure: 0, 'Public Complaint': 0 },
    loading,
    refreshing,
    error,
    reload,
  };
}
