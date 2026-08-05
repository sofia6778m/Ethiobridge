import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';

export default function CitizenOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 sm:p-8 text-white">
        <h2 className="text-xl sm:text-2xl font-bold">{t('citizen.welcomeBack')}, {user?.fullName || ''}!</h2>
        <p className="text-primary-100 text-sm mt-1">{t('citizen.dashboardDesc')}</p>
      </div>

      {/* Main actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/dashboard/citizen/create-report/infrastructure"
          className="group border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 hover:shadow-lg rounded-2xl p-6 text-center transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 transition-transform">🏗️</div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">Submit Infrastructure Report</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Report damaged roads, water, electricity, and more</p>
        </Link>
        <Link
          to="/dashboard/citizen/my-complaints"
          className="group border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-400 hover:shadow-lg rounded-2xl p-6 text-center transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 transition-transform">🗂️</div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">My Complaints</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Track your infrastructure reports, public complaints and governance complaints</p>
        </Link>
      </div>
    </div>
  );
}
