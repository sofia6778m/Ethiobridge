import { useCallback, useEffect, useRef, useState } from 'react';
import { getWithRetry, isCanceledError, extractList } from '../utils/requestUtils';

// Shared, defensive subcity-list loading used by every form/dashboard that has a
// Subcity dropdown. Guarantees:
//   - the list is fetched once and re-fetchable (reloadSubcities)
//   - the load function is STABLE: the optional onError callback is captured in a
//     ref, so parent re-renders never abort/restart the in-flight request (an
//     unstable load used to leave the dropdown stuck on "Loading subcities…")
//   - never crashes on null/empty/malformed responses (falls back to [])
//   - only active subcities are exposed
//   - every entry carries a stable id (s._id) AND a name for name-based callers
//   - a user-friendly error string + loading flag for inline UI
//
// PRIMARY endpoint is GET /api/subcities — the canonical dropdown source that
// ALWAYS returns each subcity's _id. Dependent dropdowns (woredas, government
// offices, complaint categories) resolve by _id, so an id-less response would
// render options with empty values and silently break the whole chain. The
// /api/public/subcities alias is used only as a fallback for older deployments
// that still expose the legacy { subcities: [...] } shape.
//
// Response shapes accepted: { data: [...] } (/api/subcities),
// { subcities: [...] } (/api/public/subcities) and { data: { subcities: [...] } }.
const DEFAULT_ERROR = 'Unable to load subcities. Please try again.';

const normalizeList = (res) =>
  extractList(res, 'subcities')
    .filter((s) => s && typeof s === 'object')
    .filter((s) => {
      if (s.status != null && /inactive/i.test(String(s.status))) return false;
      if (s.isActive === false) return false;
      return true;
    })
    .map((s) => ({
      _id: s._id || s.id || '',
      name: String(s.name || s.label || '').trim(),
      nameLower: String(s.nameLower || '').toLowerCase().trim(),
      description: String(s.description || ''),
      // Name-based consumers (e.g. the public infrastructure form) use `value`.
      value: s._id || s.id || String(s.name || s.label || '').trim(),
      label: String(s.name || s.label || '').trim(),
    }))
    .filter((s) => s.name);

export default function useSubcityOptions({ onError } = {}) {
  const [subcities, setSubcities] = useState([]);
  const [subcitiesLoading, setSubcitiesLoading] = useState(true);
  const [subcitiesError, setSubcitiesError] = useState('');
  const controllerRef = useRef(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubcitiesLoading(true);
    setSubcitiesError('');
    try {
      let res;
      try {
        res = await getWithRetry('/subcities', {
          signal: controller.signal,
          timeout: 10000,
        });
      } catch (err) {
        if (isCanceledError(err) || controller.signal.aborted) throw err;
        // The canonical dropdown endpoint may be absent on older deployments —
        // fall back to the public alias (legacy { subcities: [...] } shape).
        res = await getWithRetry('/public/subcities', {
          signal: controller.signal,
          timeout: 10000,
        });
      }
      if (controller.signal.aborted) return;
      const list = normalizeList(res);
      setSubcities(list);
      if (!list.length) setSubcitiesError('No active subcities are available right now.');
    } catch (err) {
      if (isCanceledError(err)) return;
      setSubcitiesError(DEFAULT_ERROR);
      onErrorRef.current?.(err);
    } finally {
      if (!controller.signal.aborted) setSubcitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { subcities, subcitiesLoading, subcitiesError, reloadSubcities: load };
}
