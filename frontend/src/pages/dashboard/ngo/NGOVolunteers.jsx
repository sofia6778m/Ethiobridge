import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { publicAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';

export default function NGOVolunteers() {
  const { t } = useTranslation();
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    publicAPI.getVolunteers({ role: 'volunteer', limit: 50 })
      .then(r => { setVolunteers(r.data.volunteers); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = volunteers.filter(v =>
    v.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (v.subcity || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.volunteers')}</h2>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('dashboard.searchVolunteers')} className="input-field" />

      {filtered.length === 0 ? <EmptyState icon="🙋" title={t('dashboard.noVolunteers')} /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => (
            <div key={v._id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
                  {v.profileImage ? <img src={v.profileImage} alt="" className="w-full h-full object-cover" /> : v.fullName[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{v.fullName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{v.subcity || ''}</p>
                </div>
              </div>
              {v.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {v.skills.slice(0, 3).map(s => <span key={s} className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.availability ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {v.availability ? t('dashboard.available') : t('dashboard.unavailable')}
                </span>
                {v.phone && <span className="text-xs text-gray-400 dark:text-gray-500">{v.phone}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
