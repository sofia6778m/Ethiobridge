import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { publicAPI } from '../../../services/api';
import EthioMap from '../../../components/map/EthioMap';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function VolunteerMap() {
  const { t } = useTranslation();
  const [markers, setMarkers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicAPI.getMapMarkers().then(r => {
      const { infrastructure, emergency, missingPersons } = r.data.markers;
      const all = [
        ...infrastructure.map(m => ({ ...m, type: 'infrastructure' })),
        ...emergency.map(m => ({ ...m, type: 'emergency' })),
        ...missingPersons.map(m => ({ ...m, type: 'missing_person' })),
      ];
      setMarkers(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? markers : markers.filter(m => m.type === filter);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800">{t('dashboard.nearbyEmergencyMap')}</h2>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-600 font-medium">{t('dashboard.filterLabel')}</span>
        {[
          { key: 'all',            label: t('dashboard.allLabel') },
          { key: 'emergency',      label: t('dashboard.emergenciesLabel') },
          { key: 'infrastructure', label: t('dashboard.infraLabel') },
          { key: 'missing_person', label: t('dashboard.missingLabel') },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{t('dashboard.markersCount', { count: filtered.length })}</span>
      </div>

      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> {t('dashboard.infraLegend')}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> {t('dashboard.emergencyLegend')}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> {t('dashboard.missingLegend')}</span>
      </div>

      {loading ? <LoadingSpinner /> : <EthioMap markers={filtered} height="500px" />}
    </div>
  );
}
