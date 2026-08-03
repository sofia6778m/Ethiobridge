import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../../../components/common/EmptyState';
import StatCard from '../../../components/common/StatCard';

const TEAM_MEMBERS = [
  { name: 'Ato Kebede Tadesse', role: 'departments.director', status: 'Active' },
  { name: 'W/ro Hirut Mengistu', role: 'departments.deputyDirector', status: 'Active' },
  { name: 'Ato Solomon Abebe', role: 'departments.projectManager', status: 'Active' },
];

export default function GovDepartmentDetail({ department, onBack }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: t('departments.tabOverview'), icon: '📊' },
    { id: 'projects', label: t('departments.tabProjects'), icon: '📋' },
    { id: 'team', label: t('departments.tabTeam'), icon: '👥' },
    { id: 'reports', label: t('departments.tabReports'), icon: '📝' },
  ];

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
        ← {t('departments.backToDepartments')}
      </button>

      <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0 bg-white/20`}>
            <span>{department.icon}</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">{t(department.nameKey)}</h2>
            <p className="text-indigo-100 text-sm">{t(department.descKey)}</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon="📄" label={t('departments.totalReports')} value={0} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🔨" label={t('departments.activeProjects')} value={0} color="bg-green-100" iconColor="text-green-600" />
        <StatCard icon="⏳" label={t('departments.pendingTasks')} value={0} color="bg-orange-100" iconColor="text-orange-600" />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {tabs.map(tabItem => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              tab === tabItem.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tabItem.icon} {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">{t('departments.aboutDepartment')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t(department.descKey)}</p>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">{t('departments.responsibilities')}</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-500 mt-0.5">✓</span>
                {t('departments.responsibility1')}
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-500 mt-0.5">✓</span>
                {t('departments.responsibility2')}
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-500 mt-0.5">✓</span>
                {t('departments.responsibility3')}
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-500 mt-0.5">✓</span>
                {t('departments.responsibility4')}
              </li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div className="card">
          <EmptyState icon="📋" title={t('departments.noProjectsYet')} description={t('departments.projectsComingSoon')} />
        </div>
      )}

      {tab === 'team' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('departments.departmentTeam')}</h3>
          <div className="space-y-3">
            {TEAM_MEMBERS.map((member, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold text-sm shrink-0">
                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{member.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t(member.role)}</p>
                </div>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">
                  {member.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="card">
          <EmptyState icon="📝" title={t('departments.noReportsYet')} description={t('departments.reportsComingSoon')} />
        </div>
      )}
    </div>
  );
}
