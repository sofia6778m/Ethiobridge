import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const REPORT_TYPES = [
  {
    to: '/dashboard/citizen/create-report/infrastructure',
    icon: '🏗️',
    title: 'Infrastructure Report',
    desc: 'Report infrastructure issues such as roads, water, electricity, drainage, waste, bridges and public facilities.',
    btnText: 'Create Infrastructure Report',
    chip: 'bg-blue-100 dark:bg-blue-900/40',
    ring: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 hover:shadow-blue-200/60 dark:hover:border-blue-600',
    hover: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    to: '/dashboard/citizen/create-report/governance',
    icon: '⚖️',
    title: 'Public Complaint',
    desc: 'Report government service delays, corruption, misconduct, unfair decisions, poor service, abuse of authority and other governance-related complaints.',
    btnText: 'Create Public Complaint',
    chip: 'bg-emerald-100 dark:bg-emerald-900/40',
    ring: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-400 hover:shadow-emerald-200/60 dark:hover:border-emerald-600',
    hover: 'bg-emerald-600 hover:bg-emerald-700',
  },
];

export default function ReportSelection() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{t('report.createTitle') || 'Report an Issue'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Choose the type of issue you want to report</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_TYPES.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className={`group relative border-2 rounded-2xl p-6 flex flex-col transition-all duration-200 hover:shadow-xl ${card.ring}`}
          >
            <div className={`w-14 h-14 rounded-xl ${card.chip} flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform`}>
              {card.icon}
            </div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-2">{card.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1 mb-5">{card.desc}</p>
            <span className={`inline-flex items-center justify-center gap-2 ${card.hover} text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all group-hover:gap-3`}>
              {card.btnText}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
