import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart } from 'recharts';
import LoadingSpinner from '../common/LoadingSpinner';

const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316'];

export default function InfraAnalytics() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [region, setRegion] = useState('');

  const REGIONS = ['Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama','Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella','Benishangul-Gumuz','Harari','Dire Dawa'];

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (region) params.region = region;
      const r = await infraAPI.getEnhancedAnalytics(params);
      setAnalytics(r.data.analytics);
    } catch (e) {
      try {
        const r = await infraAPI.getAnalytics({ dateFrom, dateTo });
        setAnalytics(r.data.analytics);
      } catch (e2) { console.error(e2); }
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingSpinner />;
  if (!analytics) return null;

  const statusData = (analytics.byStatus || []).map(s => ({
    name: t(`dashboard.status${s._id?.replace(/\s/g, '')}`) || s._id,
    value: s.count,
  }));
  const categoryData = (analytics.byCategory || []).map(c => ({
    name: t(`filterOptions.${c._id?.toLowerCase()?.replace(/\s/g, '')}`) || c._id,
    count: c.count,
  }));
  const regionData = (analytics.byRegion || []).map(r => ({
    name: r._id?.split(' ')[0],
    region: r._id,
    count: r.count,
    resolved: r.resolved || 0,
  }));
  const severityData = (analytics.bySeverity || []).map(s => ({
    name: t(`filterOptions.${s._id?.toLowerCase()}`) || s._id,
    value: s.count,
  }));
  const monthlyData = (analytics.monthlyTrend || []).map(m => ({
    month: m.month,
    total: m.total,
    resolved: m.resolved,
  }));
  const orgData = (analytics.byOrganization || []).map(o => ({
    name: o._id || 'Unassigned',
    total: o.count,
    resolved: o.resolved,
    rate: o.count > 0 ? ((o.resolved / o.count) * 100).toFixed(0) : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">{t('dashboard.infraAnalytics') || 'Infrastructure Analytics'}</h2>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="input-field text-sm w-auto">
              <option value="">All Regions</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm w-auto" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm w-auto" />
          </div>
          <button onClick={fetchData} className="btn-primary text-sm py-1.5">{t('common.search')}</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-600">{analytics.total}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.totalReports')}</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-amber-600">{analytics.pending}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.statusPending')}</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-500">{analytics.inProgress || 0}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.statusInProgress')}</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{analytics.resolved}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.statusResolved')}</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-rose-600">{analytics.reopened}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dashboard.reopened')}</p>
        </div>
      </div>

      {/* Resolution & Rating */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-center gap-4">
            <div className="text-4xl">⏱️</div>
            <div>
              <p className="text-2xl font-bold text-primary-700">{analytics.avgResolutionDays?.toFixed(1) || '—'} days</p>
              <p className="text-sm text-gray-500">{t('dashboard.avgResolution') || 'Average Resolution Time'}</p>
            </div>
          </div>
        </div>
        <div className="card bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
          <div className="flex items-center gap-4">
            <div className="text-4xl">⭐</div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{analytics.averageRating?.toFixed(1) || '—'}/5</p>
              <p className="text-sm text-gray-500">Avg. Citizen Rating ({analytics.totalRated || 0} rated)</p>
            </div>
          </div>
        </div>
        {analytics.minResolutionDays > 0 && (
          <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <div className="flex items-center gap-4">
              <div className="text-4xl">📊</div>
              <div>
                <p className="text-lg font-bold text-green-700">{analytics.minResolutionDays?.toFixed(0)} - {analytics.maxResolutionDays?.toFixed(0)} days</p>
                <p className="text-sm text-gray-500">Resolution Range</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      {monthlyData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="total" name="Total" fill="#3b82f620" stroke="#3b82f6" strokeWidth={2} />
              <Area type="monotone" dataKey="resolved" name="Resolved" fill="#10b98120" stroke="#10b981" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status Pie */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">{t('dashboard.byStatus') || 'Reports by Status'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Severity Pie */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">{t('dashboard.bySeverity') || 'Reports by Severity'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {severityData.map((_, i) => <Cell key={i} fill={['#10b981','#f59e0b','#f97316','#ef4444'][i] || COLORS[i]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Bar */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">{t('dashboard.byCategory') || 'Reports by Category'}</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Region Bar */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">{t('dashboard.byRegion') || 'Reports by Region'}</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={regionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name="Total" fill="#8b5cf6" radius={[4,4,0,0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Organization Performance */}
      {orgData.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-gray-800 mb-4">Organization Performance</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 text-xs font-medium">Organization</th>
                <th className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 text-xs font-medium">Total</th>
                <th className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 text-xs font-medium">Resolved</th>
                <th className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 text-xs font-medium">Resolution Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {orgData.map(o => (
                <tr key={o.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs font-medium">{o.name}</td>
                  <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 text-xs">{o.total}</td>
                  <td className="px-3 py-2 text-center text-green-600 dark:text-green-400 text-xs font-medium">{o.resolved}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${o.rate}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{o.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
