import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { toast } from 'react-toastify';

export default function AdminApprovals() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  const fetchPending = () => {
    setLoading(true);
    adminAPI.getPendingApprovals().then(r => { setUsers(r.data.users); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, []);

  const handleAction = async (id, action, name) => {
    setProcessing(id);
    try {
      await adminAPI.approveUser(id, { action });
      toast.success(action === 'approve' ? t('dashboard.accountApproved', { name }) : t('dashboard.accountRejected', { name }));
      fetchPending();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
    finally { setProcessing(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">{t('dashboard.pendingApprovals')}</h2>
        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">{t('dashboard.pendingCount', { count: users.length })}</span>
      </div>

      {loading ? <LoadingSpinner /> : users.length === 0 ? (
        <EmptyState icon="✅" title={t('dashboard.noPendingApprovals')} description={t('dashboard.allOrgsReviewed')} />
      ) : (
        <div className="space-y-4">
          {users.map(u => (
            <div key={u._id} className="card border-l-4 border-amber-400">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${u.role === 'government' ? 'bg-yellow-100 text-yellow-700' : 'bg-teal-100 text-teal-700'}`}>{u.role}</span>
                    {u.organizationName && <span className="text-xs text-gray-500">{u.organizationName}</span>}
                  </div>
                  <p className="font-semibold text-gray-800">{u.fullName}</p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                  {u.phone && <p className="text-sm text-gray-500">{u.phone}</p>}
                  {u.organizationType && <p className="text-xs text-gray-400">{t('dashboard.typeLabel')} {u.organizationType}</p>}
                  <p className="text-xs text-gray-400 mt-1">{t('dashboard.registeredLabel')} {new Date(u.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(u._id, 'approve', u.fullName)}
                    disabled={processing === u._id}
                    className="btn-success text-sm py-1.5 px-4"
                  >
                    {processing === u._id ? '…' : t('dashboard.approve')}
                  </button>
                  <button
                    onClick={() => handleAction(u._id, 'reject', u.fullName)}
                    disabled={processing === u._id}
                    className="btn-danger text-sm py-1.5 px-4"
                  >
                    {t('dashboard.rejectBtn')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
