import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import GovDepartmentDetail from './GovDepartmentDetail';

const DEPARTMENT_META = [
  { id: 'roads-authority',           nameKey: 'departments.roadsAuthority',           icon: '🛣️', color: 'bg-orange-100', iconColor: 'text-orange-600', borderColor: 'border-orange-200', descKey: 'departments.roadsAuthorityDesc' },
  { id: 'bridge-authority',          nameKey: 'departments.bridgeAuthority',          icon: '🌉', color: 'bg-blue-100',   iconColor: 'text-blue-600',   borderColor: 'border-blue-200',   descKey: 'departments.bridgeAuthorityDesc' },
  { id: 'water-bureau',              nameKey: 'departments.waterBureau',              icon: '💧', color: 'bg-cyan-100',   iconColor: 'text-cyan-600',   borderColor: 'border-cyan-200',   descKey: 'departments.waterBureauDesc' },
  { id: 'electric-utility',          nameKey: 'departments.electricUtility',          icon: '⚡', color: 'bg-yellow-100', iconColor: 'text-yellow-600', borderColor: 'border-yellow-200', descKey: 'departments.electricUtilityDesc' },
  { id: 'health-bureau',             nameKey: 'departments.healthBureau',             icon: '🏥', color: 'bg-red-100',    iconColor: 'text-red-600',    borderColor: 'border-red-200',    descKey: 'departments.healthBureauDesc' },
  { id: 'education-bureau',          nameKey: 'departments.educationBureau',          icon: '🎓', color: 'bg-green-100',  iconColor: 'text-green-600',  borderColor: 'border-green-200',  descKey: 'departments.educationBureauDesc' },
  { id: 'disaster-risk',             nameKey: 'departments.disasterRiskManagement',   icon: '⚠️', color: 'bg-purple-100', iconColor: 'text-purple-600', borderColor: 'border-purple-200', descKey: 'departments.disasterRiskManagementDesc' },
  { id: 'fire-emergency',            nameKey: 'departments.fireEmergencyService',     icon: '🚒', color: 'bg-rose-100',   iconColor: 'text-rose-600',   borderColor: 'border-rose-200',   descKey: 'departments.fireEmergencyServiceDesc' },
];

const DEPT_NAME_MAP = {
  'Roads Authority':            'roads-authority',
  'Bridge Authority':           'bridge-authority',
  'Water Bureau':               'water-bureau',
  'Electric Utility':           'electric-utility',
  'Health Bureau':              'health-bureau',
  'Education Bureau':           'education-bureau',
  'Disaster Risk Management':   'disaster-risk',
  'Fire and Emergency Service': 'fire-emergency',
};

export default function GovDepartments() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [departments, setDepartments] = useState(DEPARTMENT_META);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    infraAPI.getDepartmentStats()
      .then(res => {
        const stats = res.data.departments || [];
        const statsMap = {};
        for (const s of stats) statsMap[s.name] = s;

        setDepartments(DEPARTMENT_META.map(dept => {
          const statKey = Object.keys(DEPT_NAME_MAP).find(k => DEPT_NAME_MAP[k] === dept.id);
          const stat = statsMap[statKey] || {};
          return {
            ...dept,
            reportCount: stat.totalReports || 0,
            activeProjects: stat.activeProjects || 0,
            infraReports: stat.infraReports || 0,
            emergencyReports: stat.emergencyReports || 0,
          };
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = departments.filter(d => {
    const name = t(d.nameKey).toLowerCase();
    const desc = t(d.descKey).toLowerCase();
    return name.includes(search.toLowerCase()) || desc.includes(search.toLowerCase());
  });

  if (selected) {
    return <GovDepartmentDetail department={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{t('departments.title')}</h2>
        <p className="text-indigo-100 text-sm">{t('departments.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('departments.searchDepartments')}
          className="input-field flex-1 min-w-[200px]"
        />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map(dept => (
            <button
              key={dept.id}
              onClick={() => setSelected(dept)}
              className={`card p-5 text-left hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 ${dept.borderColor} group`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${dept.color}`}>
                  <span className={dept.iconColor}>{dept.icon}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm leading-tight group-hover:text-primary-600 transition-colors">
                    {t(dept.nameKey)}
                  </h3>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3 line-clamp-2">
                {t(dept.descKey)}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div>
                    <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{dept.reportCount}</p>
                    <p className="text-xs text-gray-400">{t('departments.reports')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{dept.activeProjects}</p>
                    <p className="text-xs text-gray-400">{t('departments.activeProjects')}</p>
                  </div>
                </div>
                <span className="text-xs text-primary-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('departments.viewDetails')} →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">{t('departments.noResults')}</p>
        </div>
      )}
    </div>
  );
}
