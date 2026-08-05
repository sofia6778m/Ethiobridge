import { Link } from 'react-router-dom';

const REPORT_TYPES = [
  {
    to: '/report/infrastructure',
    icon: '🏗️',
    title: 'Infrastructure Report',
    desc: 'Report damaged roads, bridges, water supply, electricity, drainage, schools, hospitals, and other public infrastructure.',
    btnText: 'Create Infrastructure Report',
    accent: 'from-blue-600 via-blue-700 to-blue-800',
    chip: 'bg-blue-100 dark:bg-blue-900/40',
    ring: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 hover:shadow-blue-200/60 dark:hover:border-blue-600',
    hover: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    to: '/report/governance-complaint',
    icon: '⚖️',
    title: 'Governance Complaint',
    desc: 'Report corruption, service delays, staff misconduct, poor government service, lack of transparency, office-related complaints, and other governance issues.',
    btnText: 'Create Governance Complaint',
    accent: 'from-emerald-600 via-emerald-700 to-teal-700',
    chip: 'bg-emerald-100 dark:bg-emerald-900/40',
    ring: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-400 hover:shadow-emerald-200/60 dark:hover:border-emerald-600',
    hover: 'bg-emerald-600 hover:bg-emerald-700',
  },
];

export default function PublicReportSelection() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-2 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> No login required
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-3">Choose Report Type</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
          Select the type of report you want to create. Anonymous submissions are welcome — you will receive a tracking ID to follow up.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {REPORT_TYPES.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className={`group relative border-2 rounded-3xl p-6 sm:p-8 flex flex-col transition-all duration-200 hover:shadow-xl ${card.ring}`}
          >
            <div className={`w-16 h-16 rounded-2xl ${card.chip} flex items-center justify-center text-4xl mb-5 group-hover:scale-110 transition-transform`}>
              {card.icon}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{card.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1 mb-6">{card.desc}</p>
            <span className={`inline-flex items-center justify-center gap-2 ${card.hover} text-white text-sm font-semibold py-3 px-5 rounded-xl transition-all group-hover:gap-3`}>
              {card.btnText}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-10 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <span className="text-base leading-none">💡</span>
        <p>
          Already submitted a report? <Link to="/track-report" className="font-semibold underline">Track an infrastructure report</Link> using your tracking ID to see its current status.
        </p>
      </div>
    </div>
  );
}
