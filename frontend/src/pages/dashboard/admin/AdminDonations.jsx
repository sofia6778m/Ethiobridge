import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaSearch, FaFilter, FaCheckCircle, FaTimesCircle, FaClock, FaEye, FaPrint,
  FaFileCsv, FaFileExcel, FaDonate, FaUsers, FaHandHoldingHeart, FaHeart,
  FaFileImage, FaChevronLeft, FaChevronRight, FaChartLine, FaChartPie,
} from 'react-icons/fa';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { donationAPI, campaignAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

const CHART_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_META = {
  pending_verification: { cls: 'badge-pending', icon: FaClock, labelKey: 'donate.statusPending' },
  verified: { cls: 'badge-resolved', icon: FaCheckCircle, labelKey: 'donate.statusVerified' },
  rejected: { cls: 'badge-rejected', icon: FaTimesCircle, labelKey: 'donate.statusRejected' },
};

export default function AdminDonations() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [campaigns, setCampaigns] = useState([]);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ status: '', paymentMethod: '', campaign: '', from: '', to: '', minAmount: '', maxAmount: '', search: '', sort: 'newest' });

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await donationAPI.getStats();
      setStats(res.data.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        sort: filters.sort,
        status: filters.status || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        campaign: filters.campaign || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        minAmount: filters.minAmount || undefined,
        maxAmount: filters.maxAmount || undefined,
        search: filters.search || undefined,
      };
      const res = await donationAPI.getAll(params);
      setRows(res.data.data || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load donations');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadStats();
    const loadMeta = async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          campaignAPI.getPublic({ limit: 200 }),
          donationAPI.getPaymentMethods(),
        ]);
        setCampaigns(cRes.data.data || []);
        setMethods(pRes.data.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    loadMeta();
  }, [loadStats]);

  const openDetail = async (row) => {
    setDetailLoading(true);
    setSelected(row);
    try {
      const res = await donationAPI.getOne(row._id);
      setDetail(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load donation');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleVerify = async () => {
    setActing(true);
    try {
      await donationAPI.verify(selected._id);
      toast.success(t('donate.admin.verifyConfirm'));
      setVerifyOpen(false);
      setSelected(null);
      setDetail(null);
      await Promise.all([loadRows(), loadStats()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error(t('donate.admin.rejectRequired'));
      return;
    }
    setActing(true);
    try {
      await donationAPI.reject(selected._id, { reason: rejectReason.trim() });
      toast.success('Donation rejected');
      setRejectOpen(false);
      setRejectReason('');
      setSelected(null);
      setDetail(null);
      await Promise.all([loadRows(), loadStats()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rejection failed');
    } finally {
      setActing(false);
    }
  };

  const handleExport = async (kind) => {
    try {
      const params = {
        status: filters.status || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        campaign: filters.campaign || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        minAmount: filters.minAmount || undefined,
        maxAmount: filters.maxAmount || undefined,
        search: filters.search || undefined,
      };
      const res = kind === 'csv'
        ? await donationAPI.exportCsv(params)
        : await donationAPI.exportExcel(params);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `ethiobridge-donations-${date}.${kind === 'csv' ? 'csv' : 'xls'}`);
      toast.success(`Export downloaded`);
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) return;
    const rowsHtml = rows.map((d) => `
      <tr>
        <td>${d.referenceNumber}</td>
        <td>${d.isAnonymous ? 'Anonymous' : (d.fullName || d.donorName || '')}</td>
        <td>${d.campaign?.title || ''}</td>
        <td>${Number(d.amount || 0).toLocaleString()} ETB</td>
        <td>${d.paymentMethodName || d.paymentMethod}</td>
        <td>${d.verificationStatus}</td>
        <td>${new Date(d.createdAt).toLocaleDateString()}</td>
      </tr>`).join('');
    win.document.write(`
      <html><head><title>EthioBridge Donations</title>
      <style>body{font-family:sans-serif} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px;font-size:12px} th{background:#f3f4f6}</style>
      </head><body>
        <h2>EthioBridge Donations Report</h2>
        <p>${new Date().toLocaleString()} — ${total} record(s)</p>
        <table><thead><tr><th>Ref</th><th>Donor</th><th>Campaign</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const statCards = stats && [
    { icon: FaDonate, label: t('donate.admin.totalVerified'), value: `${stats.totalVerified.toLocaleString()} ETB`, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/20' },
    { icon: FaCheckCircle, label: t('donate.admin.verifiedCount'), value: stats.verifiedCount.toLocaleString(), color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
    { icon: FaClock, label: t('donate.admin.pendingCount'), value: stats.pendingCount.toLocaleString(), color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/20' },
    { icon: FaTimesCircle, label: t('donate.admin.rejectedCount'), value: stats.rejectedCount.toLocaleString(), color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/20' },
    { icon: FaHandHoldingHeart, label: t('donate.admin.totalCommitted'), value: `${stats.totalCommitted.toLocaleString()} ETB`, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { icon: FaHeart, label: t('donate.admin.totalDonations'), value: stats.totalDonations.toLocaleString(), color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/20' },
    { icon: FaUsers, label: t('donate.admin.donorCount'), value: stats.donorCount.toLocaleString(), color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/20' },
  ];

  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({ status: '', paymentMethod: '', campaign: '', from: '', to: '', minAmount: '', maxAmount: '', search: '', sort: 'newest' });
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('donate.admin.pageTitle')}</h2>
          <p className="text-sm text-gray-500">{t('donate.admin.pageDesc')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary text-sm inline-flex items-center gap-2">
            <FaFileCsv /> {t('donate.admin.exportCsv')}
          </button>
          <button onClick={() => handleExport('excel')} className="btn-secondary text-sm inline-flex items-center gap-2">
            <FaFileExcel /> {t('donate.admin.exportExcel')}
          </button>
          <button onClick={handlePrint} className="btn-secondary text-sm inline-flex items-center gap-2">
            <FaPrint /> {t('donate.admin.print')}
          </button>
        </div>
      </div>

      {/* Stats */}
      {statCards && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          {statCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card text-center py-4">
                <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.color} flex items-center justify-center text-lg mx-auto mb-2`}><Icon /></div>
                <p className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">{s.value}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Monthly donations */}
          <div className="card lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FaChartLine className="text-primary-500" />
              <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">{t('donate.admin.chartMonthly')}</h3>
            </div>
            {(stats.monthly || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">{t('donate.admin.chartEmpty')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={(stats.monthly || []).map((m) => ({ ...m, label: m._id }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="donationMonthlyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ETB`} />
                  <Area type="monotone" dataKey="total" name={t('donate.admin.chartRaised')} stroke="#10b981" strokeWidth={2} fill="url(#donationMonthlyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By payment method */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <FaChartPie className="text-primary-500" />
              <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">{t('donate.admin.chartByMethod')}</h3>
            </div>
            {(stats.byMethod || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">{t('donate.admin.chartEmpty')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={(stats.byMethod || []).map((m) => ({ name: m._id, value: m.total }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {(stats.byMethod || []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ETB`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By campaign */}
          <div className="card lg:col-span-3">
            <div className="flex items-center gap-2 mb-4">
              <FaChartLine className="text-primary-500" />
              <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">{t('donate.admin.chartByCampaign')}</h3>
            </div>
            {(stats.byCampaign || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">{t('donate.admin.chartEmpty')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(stats.byCampaign || []).map((c) => ({ ...c, name: c.title || 'General' }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ETB`} />
                  <Bar dataKey="total" name={t('donate.admin.chartRaised')} radius={[4, 4, 0, 0]}>
                    {(stats.byCampaign || []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Office breakdown charts */}
      {stats && (stats.bySubcity?.length > 0 || stats.byWoreda?.length > 0 || stats.byDepartment?.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {[
            { key: 'bySubcity', title: t('donate.admin.chartBySubcity'), data: stats.bySubcity || [] },
            { key: 'byWoreda', title: t('donate.admin.chartByWoreda'), data: stats.byWoreda || [] },
            { key: 'byDepartment', title: t('donate.admin.chartByDepartment'), data: stats.byDepartment || [] },
          ].map(({ key, title, data }) => (
            <div className="card" key={key}>
              <div className="flex items-center gap-2 mb-4">
                <FaChartLine className="text-primary-500" />
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">{title}</h3>
              </div>
              {data.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">{t('donate.admin.chartEmpty')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.map((m) => ({ name: m._id || m.name || 'General', total: m.total }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ETB`} />
                    <Bar dataKey="total" name={t('donate.admin.chartRaised')} radius={[4, 4, 0, 0]}>
                      {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FaFilter className="text-gray-400" />
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="input-field text-sm col-span-2 lg:col-span-1">
            <option value="">{t('donate.admin.filterStatus')}</option>
            <option value="pending_verification">{t('donate.statusPending')}</option>
            <option value="verified">{t('donate.statusVerified')}</option>
            <option value="rejected">{t('donate.statusRejected')}</option>
          </select>
          <select value={filters.paymentMethod} onChange={(e) => setFilter('paymentMethod', e.target.value)} className="input-field text-sm col-span-2 lg:col-span-1">
            <option value="">{t('donate.admin.filterMethod')}</option>
            {methods.map((m) => <option key={m._id} value={m.code}>{m.name}</option>)}
          </select>
          <select value={filters.campaign} onChange={(e) => setFilter('campaign', e.target.value)} className="input-field text-sm col-span-2 lg:col-span-2">
            <option value="">{t('donate.admin.filterCampaign')}</option>
            {campaigns.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="input-field text-sm" title={t('donate.admin.filterDateFrom')} />
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="input-field text-sm" title={t('donate.admin.filterDateTo')} />
          <input type="number" min="0" placeholder={t('donate.admin.filterMin')} value={filters.minAmount} onChange={(e) => setFilter('minAmount', e.target.value)} className="input-field text-sm" />
          <input type="number" min="0" placeholder={t('donate.admin.filterMax')} value={filters.maxAmount} onChange={(e) => setFilter('maxAmount', e.target.value)} className="input-field text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="relative flex-1 min-w-[220px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder={t('donate.admin.searchPlaceholder')} className="input-field pl-9 text-sm" />
          </div>
          <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} className="input-field text-sm w-auto">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount_desc">Amount ↓</option>
            <option value="amount_asc">Amount ↑</option>
          </select>
          <button onClick={resetFilters} className="btn-secondary text-sm">{t('donate.admin.resetFilters')}</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <LoadingSpinner />
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t('donate.admin.empty')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('donate.admin.emptyDesc')}</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left">
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colReference')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colDonor')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colCampaign')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colAmount')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colMethod')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colStatus')}</th>
                <th className="py-3 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('donate.admin.colDate')}</th>
                <th className="py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide text-right">{t('donate.admin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const meta = STATUS_META[d.verificationStatus] || STATUS_META.pending_verification;
                return (
                  <tr key={d._id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3 pr-3">
                      <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">{d.referenceNumber}</span>
                      {d.receiptImageUrl && <span className="ml-2 text-[10px] text-green-600" title={t('donate.receiptSubmitted')}>📎</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
                        {d.isAnonymous ? t('donate.anonymous') : (d.fullName || d.donorName || '—')}
                      </p>
                      {d.phone && <p className="text-[11px] text-gray-400">{d.phone}</p>}
                    </td>
                    <td className="py-3 pr-3 text-gray-600 dark:text-gray-300 truncate max-w-[180px]">{d.campaign?.title || '—'}</td>
                    <td className="py-3 pr-3 font-semibold text-gray-800 dark:text-gray-200">{d.amount.toLocaleString()} ETB</td>
                    <td className="py-3 pr-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{d.paymentMethodName || d.paymentMethod}</span>
                      {d.recurringMonthly && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">monthly</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={meta.cls}>{t(meta.labelKey)}</span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-gray-500 dark:text-gray-400">{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button onClick={() => openDetail(d)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20" title={t('donate.admin.view')}>
                        <FaEye />
                      </button>
                      {d.verificationStatus === 'pending_verification' && (
                        <>
                          <button onClick={() => { setSelected(d); setVerifyOpen(true); }} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title={t('donate.admin.verify')}>
                            <FaCheckCircle />
                          </button>
                          <button onClick={() => { setSelected(d); setRejectReason(''); setRejectOpen(true); }} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title={t('donate.admin.reject')}>
                            <FaTimesCircle />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{total} records</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className="input-field text-sm w-auto py-1">
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} {t('donate.admin.perPage')}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"><FaChevronLeft /></button>
              <span className="text-sm text-gray-600 dark:text-gray-300">Page {page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"><FaChevronRight /></button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail modal ── */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
            <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full my-8">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('donate.admin.detailTitle')}</h3>
                <button onClick={() => { setSelected(null); setDetail(null); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">✕</button>
              </div>
              <div className="p-6">
                {detailLoading ? <LoadingSpinner /> : detail && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.colReference')}</p>
                        <p className="font-mono font-semibold text-gray-800 dark:text-gray-200">{detail.referenceNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.colStatus')}</p>
                        <span className={(STATUS_META[detail.verificationStatus] || STATUS_META.pending_verification).cls}>{t((STATUS_META[detail.verificationStatus] || STATUS_META.pending_verification).labelKey)}</span>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.detailDonor')}</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{detail.isAnonymous ? t('donate.anonymous') : (detail.fullName || '—')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.detailPhone')}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{detail.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.detailEmail')}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{detail.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.colCampaign')}</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{detail.campaign?.title || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.colAmount')}</p>
                        <p className="text-base font-bold text-green-600">{detail.amount.toLocaleString()} ETB</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.colMethod')}</p>
                        <p className="text-sm capitalize text-gray-700 dark:text-gray-300">{detail.paymentMethodName || detail.paymentMethod}</p>
                      </div>
                    </div>

                    {detail.message && (
                      <div>
                        <p className="text-xs text-gray-400">{t('donate.admin.detailMessage')}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">{detail.message}</p>
                      </div>
                    )}

                    {detail.rejectionReason && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-600 dark:text-red-300 mb-1">Rejection reason</p>
                        <p className="text-sm text-red-600 dark:text-red-400">{detail.rejectionReason}</p>
                      </div>
                    )}

                    {/* Receipt */}
                    <div>
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                        <FaFileImage /> {t('donate.admin.detailReceipt')}
                      </p>
                      {detail.receiptImageUrl ? (
                        <a href={detail.receiptImageUrl} target="_blank" rel="noreferrer" className="block">
                          <img src={detail.receiptImageUrl} alt="Payment receipt" className="w-full max-h-72 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white" />
                        </a>
                      ) : (
                        <div className="text-sm text-gray-400 bg-gray-50 dark:bg-gray-700/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                          {t('donate.admin.noReceipt')}<br />
                          <span className="text-xs">{t('donate.admin.receiptPending')}</span>
                        </div>
                      )}
                    </div>

                    {/* History */}
                    {(detail.verificationHistory || []).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">{t('donate.admin.verificationHistory')}</p>
                        <div className="space-y-2">
                          {(detail.verificationHistory || []).slice().reverse().map((h, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="w-2 h-2 rounded-full bg-primary-400 shrink-0" />
                              <span className="text-gray-600 dark:text-gray-300 capitalize">{h.action?.replace(/_/g, ' ')}</span>
                              {h.reason && <span className="text-gray-400 truncate">— {h.reason}</span>}
                              <span className="text-gray-400 ml-auto">{h.date ? new Date(h.date).toLocaleString() : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.verificationStatus === 'pending_verification' && (
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => { setVerifyOpen(true); }} className="btn-success flex-1 inline-flex items-center justify-center gap-2">
                          <FaCheckCircle /> {t('donate.admin.verify')}
                        </button>
                        <button onClick={() => { setRejectReason(''); setRejectOpen(true); }} className="btn-danger flex-1 inline-flex items-center justify-center gap-2">
                          <FaTimesCircle /> {t('donate.admin.reject')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Verify confirm modal ── */}
      <AnimatePresence>
        {verifyOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="text-center mb-4">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3"><FaCheckCircle className="text-3xl text-green-600" /></div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('donate.admin.verifyConfirm')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('donate.admin.verifyConfirmDesc')}</p>
                {selected && <p className="mt-3 font-mono text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 inline-block px-3 py-1 rounded-lg">{selected.referenceNumber}</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setVerifyOpen(false)} className="btn-secondary flex-1">{t('donate.admin.close')}</button>
                <button onClick={handleVerify} disabled={acting} className="btn-success flex-1 inline-flex items-center justify-center gap-2">
                  {acting ? '...' : <><FaCheckCircle /> {t('donate.admin.confirmVerify')}</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reject modal ── */}
      <AnimatePresence>
        {rejectOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="text-center mb-4">
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-3"><FaTimesCircle className="text-3xl text-red-500" /></div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('donate.admin.rejectTitle')}</h3>
                {selected && <p className="mt-2 font-mono text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 inline-block px-3 py-1 rounded-lg">{selected.referenceNumber}</p>}
              </div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('donate.admin.rejectReason')} *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder={t('donate.admin.rejectReasonPlaceholder')} className="input-field mb-4" />
              <div className="flex gap-3">
                <button onClick={() => setRejectOpen(false)} className="btn-secondary flex-1">{t('donate.admin.close')}</button>
                <button onClick={handleReject} disabled={acting} className="btn-danger flex-1 inline-flex items-center justify-center gap-2">
                  {acting ? '...' : <><FaTimesCircle /> {t('donate.admin.confirmReject')}</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
