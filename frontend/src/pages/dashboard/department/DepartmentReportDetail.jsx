import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deptAPI } from '../../../services/api';
import { toast } from 'react-toastify';

export default function DepartmentReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await deptAPI.getReportDetail(id);
        setReport(res.data.report);
      } catch (err) {
        toast.error('Failed to load report');
        navigate('/department/dashboard/reports');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleAction = async (action) => {
    try {
      if (action === 'accept') await deptAPI.acceptReport(id);
      else if (action === 'reject') {
        const note = prompt('Rejection reason:');
        if (!note) return;
        await deptAPI.rejectReport(id, { note });
      } else if (action === 'start') await deptAPI.startWorking(id);
      else if (action === 'complete') {
        const note = prompt('Completion note:');
        const formData = new FormData();
        if (note) formData.append('note', note);
        await deptAPI.markComplete(id, formData);
      }
      toast.success('Action completed');
      const res = await deptAPI.getReportDetail(id);
      setReport(res.data.report);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!report) return <div className="card p-12 text-center text-gray-400">Report not found</div>;

  return (
    <div>
      <button onClick={() => navigate('/department/dashboard/reports')}
        className="text-sm text-primary-600 hover:underline mb-4">&larr; Back to Reports</button>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-gray-400">{report.reportId}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[report.status] || 'bg-gray-100'}`}>{report.status}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{report.title}</h2>
          </div>
          <div className="flex gap-2">
            {report.status === 'Pending' && (
              <>
                <button onClick={() => handleAction('accept')} className="btn-primary px-4 py-2 text-sm">Accept</button>
                <button onClick={() => handleAction('reject')} className="btn-danger px-4 py-2 text-sm">Reject</button>
              </>
            )}
            {report.status === 'Assigned' && (
              <button onClick={() => handleAction('start')} className="btn-primary px-4 py-2 text-sm">Start Working</button>
            )}
            {report.status === 'In Progress' && (
              <button onClick={() => handleAction('complete')} className="btn-primary px-4 py-2 text-sm">Mark Complete</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{report.description}</p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Category:</span> <span className="font-medium">{report.category}</span></div>
              <div><span className="text-gray-500">Severity:</span> <span className="font-medium">{report.severityLevel}</span></div>
              <div><span className="text-gray-500">Region:</span> <span className="font-medium">{report.region}</span></div>
              <div><span className="text-gray-500">Subcity:</span> <span className="font-medium">{report.subcity}</span></div>
              <div><span className="text-gray-500">Submitted:</span> <span className="font-medium">{new Date(report.createdAt).toLocaleDateString()}</span></div>
              <div><span className="text-gray-500">By:</span> <span className="font-medium">{report.submittedBy?.fullName || 'Anonymous'}</span></div>
            </div>
          </div>
        </div>
      </div>

      {report.progressHistory && report.progressHistory.length > 0 && (
        <div className="card p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Progress History</h3>
          <div className="space-y-3">
            {report.progressHistory.map((h, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300">{h.status}</p>
                  {h.note && <p className="text-gray-500">{h.note}</p>}
                  <p className="text-xs text-gray-400">{new Date(h.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES = {
  'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Assigned': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'In Progress': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Completed': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
