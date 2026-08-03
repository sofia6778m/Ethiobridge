import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const TYPE_ICON = {
  category: '📂',
  region: '📍',
  title: '📄',
  zone: '🏘️',
  woreda: '🏛️',
  kebele: '🏠',
  address: '🗺️',
  reportId: '🔖',
};

const TYPE_LABEL = {
  category: 'Category',
  region: 'Region',
  title: 'Report',
  zone: 'Zone',
  woreda: 'Woreda',
  kebele: 'Kebele',
  address: 'Address',
  reportId: 'Report ID',
};

export default function SearchFilter({
  search,
  onSearch,
  filters = [],
  onFilterChange,
  filterValues = {},
  debounceMs = 300,
  autocompleteAPI,
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(search || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const fetchSuggestions = useCallback(async (query) => {
    if (!autocompleteAPI || !query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await autocompleteAPI({ q: query });
      setSuggestions(res.data?.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [autocompleteAPI]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== search) onSearch(local);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [local]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(local);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [local, fetchSuggestions]);

  useEffect(() => { setLocal(search || ''); }, [search]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = (suggestion) => {
    setLocal(suggestion.text);
    onSearch(suggestion.text);
    setShowDropdown(false);
    setHighlightIdx(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestionsRef.current.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % suggestionsRef.current.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + suggestionsRef.current.length) % suggestionsRef.current.length);
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestionsRef.current[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightIdx(-1);
    }
  };

  const grouped = suggestions.reduce((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]" ref={wrapperRef}>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            setHighlightIdx(-1);
            setShowDropdown(true);
          }}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder={t('common.search')}
          className="input-field pl-9 pr-8"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">...</span>
        )}
        {local && !loading && (
          <button
            onClick={() => { setLocal(''); onSearch(''); setSuggestions([]); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        )}

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-80 overflow-y-auto">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-750 sticky top-0">
                  {TYPE_LABEL[type] || type}
                </div>
                {items.map((s, i) => {
                  const globalIdx = suggestions.indexOf(s);
                  return (
                    <button
                      key={`${type}-${s.text}-${i}`}
                      onClick={() => selectSuggestion(s)}
                      onMouseEnter={() => setHighlightIdx(globalIdx)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${
                        highlightIdx === globalIdx
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="text-sm shrink-0">{TYPE_ICON[type] || '📋'}</span>
                      <span className="flex-1 truncate">{highlightMatch(s.text, local)}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{TYPE_LABEL[type]}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {showDropdown && local && local.trim().length >= 1 && suggestions.length === 0 && !loading && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No matching infrastructure reports found.</p>
          </div>
        )}
      </div>

      {filters.map((f) => (
        <select
          key={f.name}
          value={filterValues[f.name] || ''}
          onChange={(e) => onFilterChange(f.name, e.target.value)}
          className="input-field w-auto min-w-[150px]"
        >
          <option value="">{f.label}</option>
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-primary-600 dark:text-primary-400">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}
