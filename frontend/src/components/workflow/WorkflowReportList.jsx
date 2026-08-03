import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowAPI } from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import Pagination from '../common/Pagination';
import SearchFilter from '../common/SearchFilter';

const SEVERITY_COLORS = {
  Low: 'bg-gray-100 text-gray-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

export default function WorkflowReportList({ view, title, onSelectReport }) {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = { view, page, limit: 12 };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (severityFilter) params.severity = severityFilter;
      const res = await workflowAPI.getReports(params);
      setReports(res.data.reports);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [page, view, categoryFilter, severityFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReports();
  };

  const categories = [
    { value: 'road_issue', label: 'Road Issue' },
    { value: 'electricity_issue', label: 'Electricity Issue' },
    { value: 'water_supply_issue', label: 'Water Supply Issue' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-primary-100 text-sm">{total} report{total !== 1 ? 's' : ''} found</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reports..."
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary text-sm px-4">Search</button>
        </form>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">All Severity</option>
          {['Low', 'Medium', 'High', 'Critical'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : reports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 dark:text-gray-400">No reports found</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Report ID</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Title</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Category</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Severity</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Location</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Date</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {reports.map(r => (
                    <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary-600 dark:text-primary-400">{r.reportId}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{r.title}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[r.severityLevel]}`}>{r.severityLevel}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {r.kebele || r.woreda || r.zone || r.region}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => onSelectReport(r._id)} className="text-primary-600 hover:text-primary-800 dark:text-primary-400 text-xs font-medium">
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pages={pages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
