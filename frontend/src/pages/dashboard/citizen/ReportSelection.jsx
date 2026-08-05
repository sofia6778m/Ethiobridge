import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ReportSelection() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{t('report.createTitle') || 'Report an Issue'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Choose the type of issue you want to report</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/dashboard/citizen/create-report/infrastructure"
          className="group border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 hover:shadow-lg rounded-2xl p-6 text-left transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform">🏗️</div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">{t('home.infraTitle') || 'Infrastructure Report'}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Report damaged roads, water, electricity, and more</p>
        </Link>
      </div>

      <div className="mt-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-300">
        To submit a <strong>Governance Complaint</strong> (government service delays, misconduct, corruption), use the{' '}
        <Link to="/report/governance-complaint" className="font-semibold underline">public governance complaint form</Link>.
        Track all your reports and complaints from{' '}
        <Link to="/dashboard/citizen/my-complaints" className="font-semibold underline">My Complaints</Link>.
      </div>
    </div>
  );
}
