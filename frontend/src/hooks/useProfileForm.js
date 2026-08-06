import { useState, useCallback } from 'react';

/**
 * useProfileForm — controlled form state that is pre-filled once and stays editable.
 *
 * WHY THIS EXISTS
 * ---------------
 * Forms that auto-fill citizen contact details (full name, phone, email) from the
 * logged-in user must initialize their state exactly ONCE. If a form re-initializes
 * its state from `user` on every render — or recreates its input wrapper components
 * on every render — React remounts the inputs, which drops focus and text selection
 * after a single keystroke.
 *
 * This hook:
 *   - Lazily builds the initial state from `makeInitial` the first time the form
 *     mounts (so profile data auto-fills for logged-in citizens).
 *   - NEVER re-runs `makeInitial` on subsequent renders, even when the `user`
 *     object changes identity (context re-renders, /me refresh, etc.). The user can
 *     freely edit the auto-filled fields.
 *   - `set(key, value)` updates one field and clears its validation error in the
 *     same state batch (no error flicker while typing).
 *
 * Usage:
 *   const { form, set, errors, setErrors } = useProfileForm(() => ({
 *     fullName: user?.fullName || '',
 *     phone: user?.phone || '',
 *     email: user?.email || '',
 *     ...defaults,
 *   }));
 *
 * Rules for callers (to prevent focus loss in other forms/dashboards):
 *   1. Pass `makeInitial` as a function (lazy init) — never `useState(user?.fullName)`.
 *   2. Never call `setForm` / `setFormFields` from an effect that depends on `user`.
 *   3. Define wrapper components (SectionCard, Field, Input…) at MODULE scope, not
 *      inside the component body, or React remounts them and loses input focus.
 */
export function useProfileForm(makeInitial) {
  const [form, setForm] = useState(makeInitial);
  const [errors, setErrors] = useState({});

  const set = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setFormFields = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetForm = useCallback((makeNext) => {
    setForm(makeNext);
  }, []);

  return { form, setForm, setFormFields, resetForm, set, errors, setErrors };
}

export default useProfileForm;
