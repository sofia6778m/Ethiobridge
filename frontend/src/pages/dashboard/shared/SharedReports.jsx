import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { subcityAPI, woredaAPI } from '../../../services/api';
import { toast } from 'react-toastify';

const STATUS_STYLES = {
  'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Under Review': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Approved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Assigned': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'In Progress': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Completed': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Active': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const INFRA_STATUSES = ['Pending', 'Under Review', 'Approved', 'Assigned', 'In Progress', 'Completed', 'Resolved', 'Rejected'];
const EMERGENCY_STATUSES = ['Pending', 'Under Review', 'Active', 'In Progress', 'Resolved', 'Rejected'];
const DEPARTMENTS = ['Water', 'Electricity', 'Transport', 'Health', 'Firefighter'];

export default function SharedReports() {
  const { user } = useAuth();
  const isSubcity = user?.role?.startsWith('subcity_');
  const isWoreda = user?.role === 'woreda';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [type, setType] = useState('infrastructure');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [assigning, setAssigning] = useState(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter) params.status = filter;
      if (isSubcity) params.type = type;
      if (isWoreda && deptFilter) params.department = deptFilter;
      const api = isSubcity ? subcityAPI : woredaAPI;
      const res = await api.getReports(params);
      setReports(res.data.reports);
      setTotalPages(res.data.pages || 1);
    } catch (err) {
      toast.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, type, deptFilter]);

  const handleStatusUpdate = async (id, status) => {
    try {
      await subcityAPI.updateReportStatus(id, { status });
      toast.success('Status updated');
      fetchReports();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleAssign = async (id, department) => {
    try {
      await woredaAPI.assignToDepartment(id, { department });
      toast.success(`Assigned to ${department}`);
      setAssigning(null);
      fetchReports();
    } catch (err) {
      toast.error('Failed to assign');
    }
  };

  const statusOptions = isSubcity
    ? (type === 'emergency' ? EMERGENCY_STATUSES : INFRA_STATUSES)
    : INFRA_STATUSES;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reports</h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {isSubcity && (
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            <button onClick={() => setType('infrastructure')}
              className={`px-4 py-2 text-sm font-medium ${type === 'infrastructure' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
              Infrastructure
            </button>
            <button onClick={() => setType('emergency')}
              className={`px-4 py-2 text-sm font-medium ${type === 'emergency' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
              Emergency
            </button>
          </div>
        )}

        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
          className="input-field max-w-[180px]">
          <option value="">All Status</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {isWoreda && (
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
            className="input-field max-w-[180px]">
            <option value="">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-3">📋</p>
          <p>No reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report._id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[report.status] || 'bg-gray-100 text-gray-800'}`}>
                      {report.status}
                    </span>
                    <span className="text-xs text-gray-400">{report.reportId || report.trackingNumber}</span>
                    {report.department && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{report.department}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{report.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{report.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    <span>{report.category || report.emergencyType}</span>
                    <span>{report.region}</span>
                    <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                  {isWoreda && !report.department && report.status !== 'Rejected' && report.status !== 'Resolved' && (
                    assigning === report._id ? (
                      <div className="flex gap-1">
                        <select className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                          defaultValue="" onChange={e => { if (e.target.value) handleAssign(report._id, e.target.value); }}>
                          <option value="">Dept...</option>
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <button onClick={() => setAssigning(null)} className="text-xs text-gray-500">X</button>
                      </div>
                    ) : (
                      <button onClick={() => setAssigning(report._id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600">
                        Assign to Dept
                      </button>
                    )
                  )}
                  {isSubcity && (
                    <select
                      value={report.status}
                      onChange={e => handleStatusUpdate(report._id, e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
          <span className="flex items-center text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
