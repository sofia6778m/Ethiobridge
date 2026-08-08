import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { alertAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { ALERT_SEVERITIES } from '../../utils/alertMeta';
import AlertCard from '../../components/common/AlertCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';

// Canonical subcity/woreda set (mirrors backend scopeFilter.js).
const SUB_CITY_WOREDAS = {
  BOLE: ['Woreda 01', 'Woreda 02'],
  YEKA: ['Woreda 03', 'Woreda 04'],
  LEMMI_KURA: ['Woreda 05', 'Woreda 06'],
};

// "BOLE" / "YEKA" / "LEMMI_KURA" URL keys vs stored names like "Lemmi Kura".
const normalizePlace = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isLive = (s) => s === 'published' || s === 'active';

export default function PublicAlerts() {
  const { t } = useTranslation();
  const { on } = useSocket() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const category = searchParams.get('category') || '';
  const severity = searchParams.get('severity') || '';
  const subcity = searchParams.get('subcity') || '';
  const woreda = searchParams.get('woreda') || '';
  const q = searchParams.get('q') || '';

  const woredasFor = (sub) => SUB_CITY_WOREDAS[sub.toUpperCase()] || [];

  // Client-side mirror of the backend public filters, used to decide whether a
  // real-time alert belongs on this page (live status, unexpired, matches the
  // active category/severity/location/search filters).
  const matchesFilters = useCallback((a) => {
    if (!a || !isLive(a.status)) return false;
    if (a.expiresAt && new Date(a.expiresAt) <= new Date()) return false;
    if (category && a.category !== category) return false;
    if (severity && a.severity !== severity) return false;
    if (subcity) {
      const targets = [a.subcityName, ...(a.subcityNames || [])].map(normalizePlace);
      if (a.scope !== 'all' && !targets.includes(normalizePlace(subcity))) return false;
    }
    if (woreda) {
      const targets = [a.woredaName, ...(a.woredaNames || [])].map(normalizePlace);
      if (a.scope !== 'all' && !targets.includes(normalizePlace(woreda))) return false;
    }
    if (q && q.trim()) {
      const hay = `${a.title || ''} ${a.description || ''}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }, [category, severity, subcity, woreda, q]);

  // Merge a category (from a live alert) into the dynamic dropdown, keeping the
  // list sorted and deduplicated. Empty categories are never added.
  const mergeCategory = useCallback((value) => {
    if (!value || typeof value !== 'string') return;
    const v = value.trim();
    if (!v) return;
    setCategories((prev) => {
      if (prev.includes(v)) return prev;
      return [...prev, v].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    });
  }, []);

  // Real-time synchronization: created, edited, deleted and expired alerts
  // appear/disappear here instantly without a manual refresh.
  useEffect(() => {
    if (!on) return;
    const cleanups = [
      on('alert:new', (incoming) => {
        if (!incoming?._id) return;
        if (isLive(incoming.status)) mergeCategory(incoming.category);
        if (!matchesFilters(incoming)) return;
        setAlerts((prev) => {
          if (prev.some((a) => a._id === incoming._id)) return prev;
          return [incoming, ...prev];
        });
        setTotal((prev) => prev + 1);
      }),
      on('alert:updated', (incoming) => {
        if (!incoming?._id) return;
        if (isLive(incoming.status)) mergeCategory(incoming.category);
        if (matchesFilters(incoming)) {
          setAlerts((prev) => {
            const exists = prev.some((a) => a._id === incoming._id);
            if (!exists) {
              setTotal((n) => n + 1);
              return [incoming, ...prev];
            }
            return prev.map((a) => (a._id === incoming._id ? { ...a, ...incoming } : a));
          });
        } else {
          setAlerts((prev) => {
            if (prev.some((a) => a._id === incoming._id)) setTotal((n) => Math.max(0, n - 1));
            return prev.filter((a) => a._id !== incoming._id);
          });
        }
      }),
      on('alert:statusUpdate', (u) => {
        if (!u?._id) return;
        setAlerts((prev) => {
          if (!isLive(u.status)) {
            if (prev.some((a) => a._id === u._id)) setTotal((n) => Math.max(0, n - 1));
            return prev.filter((a) => a._id !== u._id);
          }
          return prev.map((a) => (a._id === u._id ? { ...a, status: u.status } : a));
        });
      }),
      on('alert:deleted', (u) => {
        const id = u?._id;
        if (!id) return;
        setAlerts((prev) => {
          if (prev.some((a) => a._id === id)) setTotal((n) => Math.max(0, n - 1));
          return prev.filter((a) => a._id !== id);
        });
      }),
    ];
    return () => cleanups.forEach((off) => off && off());
  }, [on, matchesFilters, mergeCategory]);

  const applyFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Selecting a different subcity resets the woreda filter.
    if (key === 'subcity' && value) next.delete('woreda');
    next.delete('page');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  useEffect(() => {
    const pageNum = parseInt(searchParams.get('page') || '1', 10);
    setPage(pageNum);
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = { page: pageNum, limit: 12 };
        if (category) params.category = category;
        if (severity) params.severity = severity;
        if (subcity) params.subcity = subcity;
        if (woreda) params.woreda = woreda;
        if (q) params.q = q;
        const res = await alertAPI.getActive(params);
        setAlerts(res.data?.data?.alerts || []);
        setPages(res.data?.data?.pages || 1);
        setTotal(res.data?.data?.total || 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchParams, category, severity, subcity, woreda, q]);

  useEffect(() => {
    alertAPI.getCategories({ scope: 'live' })
      .then((res) => {
        const cats = Array.isArray(res.data?.data?.categories) ? res.data.data.categories : [];
        setCategories(cats.filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
      })
      .catch(() => { /* keep the previous list */ });
  }, []);

  const changePage = (p) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-[60vh]">
      {/* Header */}
      <section className="bg-gradient-to-r from-primary-800 to-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <span className="text-4xl">📢</span> {t('alert.pageTitle')}
              </h1>
              <p className="text-primary-100 mt-2 max-w-2xl">{t('alert.pageDesc')}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-3 rounded-xl text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
              <span className="font-semibold">{total}</span>
              <span className="text-primary-100">{t('alert.activeAlerts')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5">
        <div className="card p-4 shadow-lg border-t-4 border-primary-500">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={category} onChange={(e) => applyFilter('category', e.target.value)}
              className="input-field w-auto text-sm">
              <option value="">{t('alert.allCategories')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={severity} onChange={(e) => applyFilter('severity', e.target.value)}
              className="input-field w-auto text-sm">
              <option value="">{t('alert.allSeverities')}</option>
              {ALERT_SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
              ))}
            </select>
            <select value={subcity} onChange={(e) => applyFilter('subcity', e.target.value)}
              className="input-field w-auto text-sm">
              <option value="">{t('alert.allSubcities')}</option>
              {Object.keys(SUB_CITY_WOREDAS).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {subcity && (
              <select value={woreda} onChange={(e) => applyFilter('woreda', e.target.value)}
                className="input-field w-auto text-sm">
                <option value="">{t('alert.allWoredas')}</option>
                {woredasFor(subcity).map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            )}
            <input
              value={q}
              onChange={(e) => applyFilter('q', e.target.value)}
              placeholder={t('alert.searchPlaceholder')}
              className="input-field text-sm flex-1 min-w-[200px]"
            />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <LoadingSpinner />
        ) : alerts.length === 0 ? (
          <EmptyState icon="📢" title={t('alert.noAlerts')} description={t('alert.noAlertsDesc')} />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {alerts.map((a) => (
                <AlertCard key={a._id} alert={a} />
              ))}
            </div>
            <div className="mt-8">
              <Pagination page={page} pages={pages} onPageChange={changePage} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
