import { useState, useEffect } from 'react';

// Returns `value` after it has stopped changing for `delay` ms. Used to debounce
// search inputs so the complaints API is not called on every keystroke.
export default function useDebouncedValue(value, delay = 600) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
